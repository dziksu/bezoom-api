import { createHash } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { and, eq, inArray, or } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { KeycloakTokenVerifier } from '../src/shared/infrastructure/auth/keycloak/keycloak-token.verifier';
import { DrizzleWriteService } from '../src/shared/infrastructure/drizzle-write.service';
import {
  accountDeletions,
  eventComments,
  eventLikes,
  eventParticipants,
  eventPhotos,
  eventSaves,
  eventStats,
  events,
  friendships,
  locations,
  moderationReports,
  notifications,
  profiles,
  userBlocks
} from '../src/shared/infrastructure/database/schema';
import { ApiExceptionFilter, validationExceptionFactory } from '../src/shared/infrastructure/http';
import { AccountDeletionWorker } from '../src/modules/user/services/account-deletion.worker';
import { KeycloakAccountManagementService } from '../src/modules/user/infrastructure/keycloak-account-management.service';

interface LifecycleBody {
  deletionScheduledAt?: string;
}

describe('Account lifecycle and erasure saga (e2e)', () => {
  let app: INestApplication<App>;
  let write: DrizzleWriteService;
  let worker: AccountDeletionWorker;
  const logoutUser = jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined);
  const deleteUser = jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined);
  const userSub = 'account-lifecycle-e2e-user';
  const otherSub = 'account-lifecycle-e2e-other';
  const profileId = '6c9e42fc-df5a-44ea-aa5a-da1c962c3810';
  const otherProfileId = '0bc850a0-12ac-4f8b-819d-43b721845f45';
  const eventId = 'ae3c1b11-f222-4951-83b0-2a4ec75195dc';
  const commentId = '8ad88c69-f87f-4bd5-99e1-cf5c93aab5e5';

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(KeycloakTokenVerifier)
      .useValue({
        verify: jest.fn((token: string) => ({
          sub: token === 'other-token' ? otherSub : userSub,
          email: token === 'other-token' ? 'other@example.com' : 'delete-me@example.com',
          email_verified: true,
          given_name: 'Delete',
          family_name: 'Me',
          auth_time: token === 'old-auth-token' ? Math.floor(Date.now() / 1_000) - 600 : Math.floor(Date.now() / 1_000),
          iat: Math.floor(Date.now() / 1_000),
          typ: 'Bearer',
          aud: ['bezoom-api']
        }))
      })
      .overrideProvider(KeycloakAccountManagementService)
      .useValue({
        accountConsoleUrl: () => 'http://keycloak.local/realms/bezoom/account',
        logoutUser,
        deleteUser
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory
      })
    );
    app.useGlobalFilters(new ApiExceptionFilter());
    write = app.get(DrizzleWriteService);
    worker = app.get(AccountDeletionWorker);
    await cleanup();
    await seed();
    await app.init();
    await app.listen(0, '127.0.0.1');
  });

  it('delegates identity settings to Keycloak and supports reversible deactivation', async () => {
    const status = await authenticated(request(app.getHttpServer()).get('/api/user/account')).expect(200);
    expect(status.body).toMatchObject({
      status: 'ACTIVE',
      accountConsoleUrl: 'http://keycloak.local/realms/bezoom/account',
      managedByKeycloak: ['EMAIL', 'FIRST_NAME', 'LAST_NAME', 'PASSWORD', 'MFA', 'SESSIONS', 'LINKED_IDENTITIES']
    });
    await request(app.getHttpServer()).get(`/api/events/${eventId}`).expect(200);

    await authenticated(request(app.getHttpServer()).post('/api/user/account/deactivate'))
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ status: 'DEACTIVATED' }));
    expect(logoutUser).toHaveBeenCalledWith(userSub);

    const blocked = await authenticated(request(app.getHttpServer()).get('/api/user/profile')).expect(403);
    expect(blocked.body).toMatchObject({ error: { code: 'ACCOUNT_DEACTIVATED' } });
    await request(app.getHttpServer()).get(`/api/events/${eventId}`).expect(404);

    await authenticated(request(app.getHttpServer()).post('/api/user/account/reactivate'))
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ status: 'ACTIVE' }));
    await authenticated(request(app.getHttpServer()).get('/api/user/profile')).expect(200);
    await request(app.getHttpServer()).get(`/api/events/${eventId}`).expect(200);

    const delegatedIdentityField = await authenticated(request(app.getHttpServer()).patch('/api/user/profile'))
      .send({ firstName: 'Changed outside Keycloak' })
      .expect(400);
    expect(delegatedIdentityField.body).toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        fields: { firstName: [{ code: 'VALIDATION_FIELD_NOT_ALLOWED' }] }
      }
    });

    const staleAuth = await request(app.getHttpServer())
      .delete('/api/user/account')
      .set('authorization', 'Bearer old-auth-token')
      .expect(401);
    expect(staleAuth.body).toMatchObject({ error: { code: 'ACCOUNT_REAUTHENTICATION_REQUIRED' } });
  });

  it('schedules idempotently, allows cancellation, and blocks all regular API immediately', async () => {
    const first = await authenticated(request(app.getHttpServer()).delete('/api/user/account')).expect(202);
    const repeated = await authenticated(request(app.getHttpServer()).delete('/api/user/account')).expect(202);
    const firstBody = first.body as LifecycleBody;
    const repeatedBody = repeated.body as LifecycleBody;
    expect(first.body).toMatchObject({ status: 'PENDING_DELETION' });
    expect(repeatedBody.deletionScheduledAt).toBe(firstBody.deletionScheduledAt);

    const blocked = await authenticated(request(app.getHttpServer()).patch('/api/user/profile'))
      .send({ bio: 'must not be accepted' })
      .expect(403);
    expect(blocked.body).toMatchObject({ error: { code: 'ACCOUNT_DELETION_PENDING' } });

    await authenticated(request(app.getHttpServer()).post('/api/user/account/deletion/cancel'))
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ status: 'ACTIVE' }));
    await authenticated(request(app.getHttpServer()).patch('/api/user/profile'))
      .send({ bio: 'active again' })
      .expect(200);
  });

  it('anonymizes domain data, deletes Keycloak last, and prevents zombie reprovisioning', async () => {
    await authenticated(request(app.getHttpServer()).delete('/api/user/account')).expect(202);
    const [deletion] = await write.db
      .select({ id: accountDeletions.id })
      .from(accountDeletions)
      .where(
        and(eq(accountDeletions.profileId, profileId), inArray(accountDeletions.status, ['REQUESTED', 'ANONYMIZING']))
      )
      .limit(1);
    await write.db
      .update(accountDeletions)
      .set({ scheduledAt: new Date(Date.now() - 1_000), nextAttemptAt: new Date(Date.now() - 1_000) })
      .where(eq(accountDeletions.id, deletion.id));

    await expect(worker.processDueDeletion()).resolves.toBe(true);
    expect(deleteUser).toHaveBeenCalledWith(userSub);

    const [profile] = await write.db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1);
    expect(profile).toMatchObject({
      keycloakSub: `deleted:${profileId}`,
      accountStatus: 'ANONYMIZED',
      isDeactivated: true,
      email: null,
      phoneNumber: null,
      username: null,
      avatarUrl: null
    });
    const [deletedEvent] = await write.db.select().from(events).where(eq(events.id, eventId)).limit(1);
    expect(deletedEvent).toMatchObject({
      organizerKeycloakSub: `deleted:${profileId}`,
      status: 'CANCELLED'
    });
    expect(deletedEvent.archivedAt).toBeInstanceOf(Date);

    const [comment] = await write.db.select().from(eventComments).where(eq(eventComments.id, commentId)).limit(1);
    expect(comment).toMatchObject({ authorKeycloakSub: `deleted:${profileId}`, body: '' });
    expect(comment.deletedAt).toBeInstanceOf(Date);
    expect(await write.db.select().from(eventLikes).where(eq(eventLikes.keycloakSub, userSub))).toHaveLength(0);
    expect(await write.db.select().from(eventSaves).where(eq(eventSaves.keycloakSub, userSub))).toHaveLength(0);
    expect(
      await write.db.select().from(eventParticipants).where(eq(eventParticipants.keycloakSub, userSub))
    ).toHaveLength(0);
    expect(
      await write.db
        .select()
        .from(userBlocks)
        .where(or(eq(userBlocks.blockerKeycloakSub, userSub), eq(userBlocks.blockedKeycloakSub, userSub)))
    ).toHaveLength(0);

    const [completed] = await write.db
      .select()
      .from(accountDeletions)
      .where(eq(accountDeletions.id, deletion.id))
      .limit(1);
    expect(completed).toMatchObject({ status: 'COMPLETED', keycloakUserId: null });
    expect(completed.subjectHash).toBe(createHash('sha256').update(userSub).digest('hex'));

    const staleToken = await authenticated(request(app.getHttpServer()).get('/api/user/profile')).expect(403);
    expect(staleToken.body).toMatchObject({ error: { code: 'ACCOUNT_DELETED' } });
    expect(await write.db.select().from(profiles).where(eq(profiles.keycloakSub, userSub))).toHaveLength(0);

    const publicProfile = await request(app.getHttpServer())
      .get(`/api/user/profile/${profileId}`)
      .set('authorization', 'Bearer other-token')
      .expect(404);
    expect(publicProfile.body).toMatchObject({ error: { code: 'PROFILE_NOT_FOUND' } });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  function authenticated(test: request.Test): request.Test {
    return test.set('authorization', 'Bearer current-token');
  }

  async function seed(): Promise<void> {
    await write.db.insert(profiles).values([
      {
        id: profileId,
        keycloakSub: userSub,
        username: 'delete-me',
        email: 'delete-me@example.com',
        phoneNumber: '+48123456789',
        isPhoneVerified: true,
        bio: 'PII profile'
      },
      { id: otherProfileId, keycloakSub: otherSub, username: 'other-user' }
    ]);
    await write.db.insert(events).values({
      id: eventId,
      title: 'Lifecycle event',
      description: 'A sufficiently long lifecycle event description used by the account deletion integration test.',
      category: 'SOCIAL_MEETUPS',
      startDate: new Date(Date.now() + 86_400_000),
      organizerKeycloakSub: userSub,
      priceType: 'FREE',
      status: 'PUBLISHED',
      mediaPipelineStatus: 'READY',
      verificationStatus: 'VERIFIED',
      visibility: 'PUBLIC'
    });
    await write.db.insert(locations).values({ eventId, latitude: '50.0647000', longitude: '19.9450000' });
    await write.db.insert(eventStats).values({
      eventId,
      likesCount: 1,
      savesCount: 1,
      attendingCount: 1,
      commentsCount: 1
    });
    await write.db.insert(eventLikes).values({ eventId, keycloakSub: userSub });
    await write.db.insert(eventSaves).values({ eventId, keycloakSub: userSub });
    await write.db.insert(eventParticipants).values({ eventId, keycloakSub: userSub, status: 'CONFIRMED' });
    await write.db.insert(eventComments).values({ id: commentId, eventId, authorKeycloakSub: userSub, body: 'PII' });
    await write.db.insert(eventPhotos).values({
      eventId,
      ownerKeycloakSub: userSub,
      rawKey: `events/pending/${userSub}/photo.jpg`,
      mediaKey: `events/${eventId}/photo.jpg`,
      status: 'READY',
      mimeType: 'image/jpeg'
    });
    await write.db.insert(moderationReports).values({
      eventId,
      reportedByKeycloakSub: userSub,
      reason: 'OTHER'
    });
    await write.db.insert(userBlocks).values({ blockerKeycloakSub: userSub, blockedKeycloakSub: otherSub });
    await write.db.insert(friendships).values({ keycloakSub1: userSub, keycloakSub2: otherSub });
    await write.db.insert(notifications).values({ keycloakSub: userSub, type: 'EVENT_UPDATE', content: 'PII' });
  }

  async function cleanup(): Promise<void> {
    await write.db.delete(moderationReports).where(eq(moderationReports.eventId, eventId));
    await write.db
      .delete(userBlocks)
      .where(
        or(
          inArray(userBlocks.blockerKeycloakSub, [userSub, otherSub, `deleted:${profileId}`]),
          inArray(userBlocks.blockedKeycloakSub, [userSub, otherSub, `deleted:${profileId}`])
        )
      );
    await write.db
      .delete(friendships)
      .where(
        or(
          inArray(friendships.keycloakSub1, [userSub, otherSub, `deleted:${profileId}`]),
          inArray(friendships.keycloakSub2, [userSub, otherSub, `deleted:${profileId}`])
        )
      );
    await write.db.delete(notifications).where(inArray(notifications.keycloakSub, [userSub, otherSub]));
    await write.db.delete(eventStats).where(eq(eventStats.eventId, eventId));
    await write.db.delete(locations).where(eq(locations.eventId, eventId));
    await write.db.delete(events).where(eq(events.id, eventId));
    await write.db.delete(accountDeletions).where(eq(accountDeletions.profileId, profileId));
    await write.db.delete(profiles).where(inArray(profiles.id, [profileId, otherProfileId]));
  }
});
