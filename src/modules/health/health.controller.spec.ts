import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import type { HealthService } from './health.service';

describe('HealthController', () => {
  it('keeps liveness independent from downstream dependencies', () => {
    const readiness = jest.fn();
    const health = { readiness } as unknown as HealthService;
    const controller = new HealthController(health);

    expect(controller.liveness()).toMatchObject({ status: 'ok', service: 'bezoom-api' });
    expect(readiness).not.toHaveBeenCalled();
  });

  it('returns dependency statuses when ready', async () => {
    const checks = { database: 'up', redis: 'up', object_storage: 'up' } as const;
    const health = { readiness: jest.fn().mockResolvedValue({ ready: true, checks }) } as unknown as HealthService;
    const controller = new HealthController(health);

    await expect(controller.readiness()).resolves.toMatchObject({ status: 'ready', checks });
  });

  it('uses a stable error key and names only failed dependencies', async () => {
    const health = {
      readiness: jest.fn().mockResolvedValue({
        ready: false,
        checks: { database: 'up', redis: 'down', object_storage: 'down' }
      })
    } as unknown as HealthService;
    const controller = new HealthController(health);

    try {
      await controller.readiness();
      fail('Expected readiness to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getResponse()).toEqual({
        code: 'DEPENDENCY_UNAVAILABLE',
        details: { dependencies: ['redis', 'object_storage'] }
      });
    }
  });
});
