import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { and, eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { KeycloakTokenVerifier } from '../src/shared/infrastructure/auth/keycloak/keycloak-token.verifier';
import { DrizzleWriteService } from '../src/shared/infrastructure/drizzle-write.service';
import {
  eventStats,
  events,
  locations,
  moderationReports,
  profiles,
  userBlocks
} from '../src/shared/infrastructure/database/schema';
import { ApiExceptionFilter, validationExceptionFactory } from '../src/shared/infrastructure/http';

describe('Safety report/block flow (e2e)', () => {
  let app: INestApplication<App>;
  let write: DrizzleWriteService;
  const eventId = 'c6217fc2-d55c-47a3-9f60-536097c7ccf4';
  const organizerProfileId = '71881f48-850c-4a4c-b245-78df06a55d9a';
  const reporterProfileId = 'b30e1ce6-e625-4526-98db-ba268028c2fa';
  const organizerSub = 'safety-e2e-organizer';
  const reporterSub = 'safety-e2e-reporter';

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(KeycloakTokenVerifier)
      .useValue({
        verify: jest.fn((token: string) => ({
          sub: token === 'organizer-token' ? organizerSub : reporterSub,
          typ: 'Bearer',
          aud: ['bezoom-api']
        }))
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
    await cleanup();
    await write.db.insert(profiles).values([
      { id: organizerProfileId, keycloakSub: organizerSub, username: 'safety-organizer' },
      { id: reporterProfileId, keycloakSub: reporterSub, username: 'safety-reporter' }
    ]);
    await write.db.insert(events).values({
      id: eventId,
      title: 'Safety E2E event',
      description: 'A public event used to verify report and user-block behavior in a real database.',
      category: 'SOCIAL_MEETUPS',
      startDate: new Date(Date.now() + 86_400_000),
      organizerKeycloakSub: organizerSub,
      priceType: 'FREE',
      status: 'PUBLISHED',
      mediaPipelineStatus: 'READY',
      verificationStatus: 'VERIFIED',
      visibility: 'PUBLIC'
    });
    await write.db.insert(locations).values({
      eventId,
      latitude: '50.0647000',
      longitude: '19.9450000',
      city: 'Kraków'
    });
    await write.db.insert(eventStats).values({ eventId });
    await app.init();
    await app.listen(0, '127.0.0.1');
  });

  it('creates one pending report idempotently and validates reason keys', async () => {
    const first = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/reports`)
      .set('authorization', 'Bearer reporter-token')
      .send({ reason: 'FRAUD', description: '  suspicious tickets  ' })
      .expect(201);
    const repeated = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/reports`)
      .set('authorization', 'Bearer reporter-token')
      .send({ reason: 'SPAM' })
      .expect(201);
    const firstBody = first.body as { id: string };
    const repeatedBody = repeated.body as { id: string };

    expect(first.body).toMatchObject({
      eventId,
      reason: 'FRAUD',
      description: 'suspicious tickets',
      status: 'PENDING'
    });
    expect(first.body).not.toHaveProperty('reportedByKeycloakSub');
    expect(repeatedBody.id).toBe(firstBody.id);
    const stored = await write.db
      .select({ id: moderationReports.id })
      .from(moderationReports)
      .where(and(eq(moderationReports.eventId, eventId), eq(moderationReports.status, 'PENDING')));
    expect(stored).toHaveLength(1);

    const invalid = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/reports`)
      .set('authorization', 'Bearer reporter-token')
      .send({ reason: 'NOT_A_REASON' })
      .expect(400);
    expect(invalid.body).toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        fields: { reason: [{ code: 'VALIDATION_IS_ENUM' }] }
      }
    });
  });

  it('blocks bidirectionally for authenticated reads, lists by cursor contract and unblocks', async () => {
    await request(app.getHttpServer())
      .put(`/api/user/blocks/${organizerProfileId}`)
      .set('authorization', 'Bearer reporter-token')
      .expect(200, { profileId: organizerProfileId, blocked: true });

    const list = await request(app.getHttpServer())
      .get('/api/user/blocks?limit=20')
      .set('authorization', 'Bearer reporter-token')
      .expect(200);
    expect(list.body).toMatchObject({
      items: [{ id: organizerProfileId, username: 'safety-organizer' }],
      hasMore: false
    });
    expect(list.body).not.toHaveProperty('page');
    expect(list.body).not.toHaveProperty('total');

    await request(app.getHttpServer()).get(`/api/events/${eventId}`).expect(200);
    const concealed = await request(app.getHttpServer())
      .get(`/api/events/${eventId}`)
      .set('authorization', 'Bearer reporter-token')
      .expect(404);
    expect(concealed.body).toMatchObject({ error: { code: 'EVENT_NOT_FOUND' } });

    const selfBlock = await request(app.getHttpServer())
      .put(`/api/user/blocks/${reporterProfileId}`)
      .set('authorization', 'Bearer reporter-token')
      .expect(400);
    expect(selfBlock.body).toMatchObject({ error: { code: 'USER_CANNOT_BLOCK_SELF' } });

    await request(app.getHttpServer())
      .delete(`/api/user/blocks/${organizerProfileId}`)
      .set('authorization', 'Bearer reporter-token')
      .expect(204);
    await request(app.getHttpServer())
      .get(`/api/events/${eventId}`)
      .set('authorization', 'Bearer reporter-token')
      .expect(200);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup(): Promise<void> {
    await write.db.delete(moderationReports).where(eq(moderationReports.eventId, eventId));
    await write.db
      .delete(userBlocks)
      .where(
        and(
          inArray(userBlocks.blockerKeycloakSub, [organizerSub, reporterSub]),
          inArray(userBlocks.blockedKeycloakSub, [organizerSub, reporterSub])
        )
      );
    await write.db.delete(eventStats).where(eq(eventStats.eventId, eventId));
    await write.db.delete(locations).where(eq(locations.eventId, eventId));
    await write.db.delete(events).where(eq(events.id, eventId));
    await write.db.delete(profiles).where(inArray(profiles.id, [organizerProfileId, reporterProfileId]));
  }
});
