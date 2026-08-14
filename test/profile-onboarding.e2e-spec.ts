import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { KeycloakTokenVerifier } from '../src/shared/infrastructure/auth/keycloak/keycloak-token.verifier';
import { DrizzleWriteService } from '../src/shared/infrastructure/drizzle-write.service';
import { eventPhotos, profiles } from '../src/shared/infrastructure/database/schema';
import { ApiExceptionFilter, validationExceptionFactory } from '../src/shared/infrastructure/http';
import { ObjectStorageService } from '../src/shared/infrastructure/storage/object-storage.service';

interface ProfileBody {
  id: string;
  avatarUrl?: string;
}

interface PhotoUploadBody {
  uploadUrl: string;
  expiresInSeconds: number;
}

describe('Personal profile onboarding (e2e)', () => {
  let app: INestApplication<App>;
  let write: DrizzleWriteService;
  let storage: ObjectStorageService;
  const userSub = 'profile-onboarding-e2e-user';
  const email = 'profile-onboarding@example.com';

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(KeycloakTokenVerifier)
      .useValue({
        verify: jest.fn(() => ({
          sub: userSub,
          email,
          email_verified: true,
          preferred_username: 'idp-name-is-not-the-profile-nick',
          iat: Math.floor(Date.now() / 1_000),
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
    storage = app.get(ObjectStorageService);
    await cleanup();
    await app.init();
    await app.listen(0, '127.0.0.1');
  });

  it('provisions once, completes onboarding with a nick, and keeps the avatar optional', async () => {
    const first = await request(app.getHttpServer())
      .get('/api/user/profile')
      .set('authorization', 'Bearer onboarding-token')
      .expect(200);
    const firstBody = first.body as ProfileBody;

    expect(first.body).toMatchObject({
      accountType: 'personal',
      email,
      isPhoneVerified: false,
      onboardingCompleted: false
    });
    expect(first.body).not.toHaveProperty('username');
    expect(first.body).not.toHaveProperty('avatarUrl');

    const beforeOnboarding = await request(app.getHttpServer())
      .post('/api/events/photos/upload-urls')
      .set('authorization', 'Bearer onboarding-token')
      .send({ files: [{ mimeType: 'image/png' }] })
      .expect(409);
    expect(beforeOnboarding.body).toMatchObject({ error: { code: 'PROFILE_ONBOARDING_REQUIRED' } });

    const completed = await request(app.getHttpServer())
      .patch('/api/user/profile')
      .set('authorization', 'Bearer onboarding-token')
      .send({ username: '  New_User-1  ' })
      .expect(200);
    expect(completed.body).toMatchObject({
      id: firstBody.id,
      username: 'new_user-1',
      onboardingCompleted: true,
      isPhoneVerified: false
    });

    const beforePhoneVerification = await request(app.getHttpServer())
      .post('/api/events/photos/upload-urls')
      .set('authorization', 'Bearer onboarding-token')
      .send({ files: [{ mimeType: 'image/png' }] })
      .expect(409);
    expect(beforePhoneVerification.body).toMatchObject({ error: { code: 'PHONE_VERIFICATION_REQUIRED' } });

    const png = Buffer.from('89504e470d0a1a0a0000000049454e44ae426082', 'hex');
    const avatar = await request(app.getHttpServer())
      .post('/api/user/profile/avatar')
      .set('authorization', 'Bearer onboarding-token')
      .attach('file', png, { filename: 'avatar.png', contentType: 'image/png' })
      .expect(201);
    const avatarBody = avatar.body as ProfileBody;
    expect(avatar.body).toMatchObject({ id: firstBody.id, onboardingCompleted: true });
    expect(avatarBody.avatarUrl).toContain(`/avatars/profiles/${firstBody.id}/`);

    const [storedProfile] = await write.db
      .select({ avatarStoragePath: profiles.avatarStoragePath })
      .from(profiles)
      .where(eq(profiles.keycloakSub, userSub))
      .limit(1);
    const avatarKey = storedProfile.avatarStoragePath!.replace(`${storage.avatarBucket}/`, '');
    expect(await storage.statObject(storage.avatarBucket, avatarKey)).toMatchObject({ size: png.length });

    const repeated = await request(app.getHttpServer())
      .get('/api/user/profile')
      .set('authorization', 'Bearer onboarding-token')
      .expect(200);
    expect(repeated.body).toMatchObject({ id: firstBody.id, username: 'new_user-1', onboardingCompleted: true });

    await request(app.getHttpServer())
      .delete('/api/user/profile/avatar')
      .set('authorization', 'Bearer onboarding-token')
      .expect(200);
    expect(await storage.statObject(storage.avatarBucket, avatarKey)).toBeNull();
  });

  it('allows starting event creation only after phone verification', async () => {
    await write.db
      .update(profiles)
      .set({ phoneNumber: '+48123456789', isPhoneVerified: true })
      .where(eq(profiles.keycloakSub, userSub));

    const response = await request(app.getHttpServer())
      .post('/api/events/photos/upload-urls')
      .set('authorization', 'Bearer onboarding-token')
      .send({ files: [{ mimeType: 'image/png' }] })
      .expect(201);
    const responseBody = response.body as PhotoUploadBody[];

    expect(responseBody).toHaveLength(1);
    expect(responseBody[0]).toMatchObject({ expiresInSeconds: 900 });
    expect(responseBody[0].uploadUrl).toContain('/raw-uploads/');
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup(): Promise<void> {
    await write.db.delete(eventPhotos).where(eq(eventPhotos.ownerKeycloakSub, userSub));
    await write.db.delete(profiles).where(inArray(profiles.keycloakSub, [userSub]));
  }
});
