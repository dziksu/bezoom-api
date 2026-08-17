import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { KeycloakTokenVerifier } from '../src/shared/infrastructure/auth/keycloak/keycloak-token.verifier';
import { profiles } from '../src/shared/infrastructure/database/schema';
import { DrizzleWriteService } from '../src/shared/infrastructure/drizzle-write.service';
import { ApiExceptionFilter, validationExceptionFactory } from '../src/shared/infrastructure/http';

describe('User account settings (e2e)', () => {
  let app: INestApplication<App>;
  let write: DrizzleWriteService;
  const userSub = 'user-settings-e2e-user';

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(KeycloakTokenVerifier)
      .useValue({
        verify: jest.fn(() => ({
          sub: userSub,
          email: 'settings@example.com',
          email_verified: true,
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
        transformOptions: { enableImplicitConversion: true },
        exceptionFactory: validationExceptionFactory
      })
    );
    app.useGlobalFilters(new ApiExceptionFilter());
    write = app.get(DrizzleWriteService);
    await cleanup();
    await app.init();
    await app.listen(0, '127.0.0.1');
  });

  it('returns defaults and persists partial updates', async () => {
    const defaults = await request(app.getHttpServer())
      .get('/api/user/settings')
      .set('authorization', 'Bearer settings-token')
      .expect(200);
    expect(defaults.body).toMatchObject({
      theme: 'DARK',
      eventRemindersEnabled: true,
      nearbyEventsEnabled: true,
      socialActivityEnabled: false,
      language: 'pl',
      country: 'PL',
      currency: 'PLN',
      timeZone: 'Europe/Warsaw'
    });

    const updated = await request(app.getHttpServer())
      .patch('/api/user/settings')
      .set('authorization', 'Bearer settings-token')
      .send({
        theme: 'light',
        eventRemindersEnabled: false,
        socialActivityEnabled: true,
        language: 'en-gb',
        country: 'gb',
        currency: 'gbp',
        timeZone: 'Europe/London'
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      theme: 'LIGHT',
      eventRemindersEnabled: false,
      nearbyEventsEnabled: true,
      socialActivityEnabled: true,
      language: 'en-GB',
      country: 'GB',
      currency: 'GBP',
      timeZone: 'Europe/London'
    });

    const persisted = await request(app.getHttpServer())
      .get('/api/user/settings')
      .set('authorization', 'Bearer settings-token')
      .expect(200);
    expect(persisted.body).toMatchObject(updated.body);
  });

  it('rejects invalid and unknown settings', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/user/settings')
      .set('authorization', 'Bearer settings-token')
      .send({ eventRemindersEnabled: 'false', unknownSetting: true })
      .expect(400);

    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup(): Promise<void> {
    await write.db.delete(profiles).where(eq(profiles.keycloakSub, userSub));
  }
});
