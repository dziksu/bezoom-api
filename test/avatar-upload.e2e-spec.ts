import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ApiExceptionFilter } from '../src/shared/infrastructure/http';
import { RedisRateLimitGuard } from '../src/shared/infrastructure/rate-limit/redis-rate-limit.guard';
import { UserController } from '../src/modules/user/user.controller';
import { ProfileService } from '../src/modules/user/services/profile.service';
import { EventReadService } from '../src/modules/events/infrastructure/read/event-read.service';

describe('Avatar upload limit (e2e)', () => {
  let app: INestApplication<App>;
  const uploadAvatar = jest.fn();

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        { provide: ProfileService, useValue: { uploadAvatar } },
        { provide: EventReadService, useValue: {} }
      ]
    })
      .overrideGuard(RedisRateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
    await app.listen(0, '127.0.0.1');
  });

  it('rejects an oversized avatar before calling the storage service', async () => {
    const response = await request(app.getHttpServer())
      .post('/user/profile/avatar')
      .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: 'avatar.jpg',
        contentType: 'image/jpeg'
      })
      .expect(413);

    expect(response.body).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  afterAll(async () => app?.close());
});
