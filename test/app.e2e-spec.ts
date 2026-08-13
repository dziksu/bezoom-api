import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { ApiExceptionFilter, validationExceptionFactory } from './../src/shared/infrastructure/http';

describe('Bezoom API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

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
    await app.init();
    await app.listen(0, '127.0.0.1');
  });

  it('GET /api/health/live returns liveness', async () => {
    const response = await request(app.getHttpServer()).get('/api/health/live').expect(200);
    expect(response.body).toMatchObject({ status: 'ok', service: 'bezoom-api' });
  });

  it('propagates a safe request ID in a keyed error', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/route-that-does-not-exist')
      .set('x-request-id', 'e2e-request-id')
      .expect(404);

    expect(response.headers['x-request-id']).toBe('e2e-request-id');
    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        requestId: 'e2e-request-id'
      }
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
