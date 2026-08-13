import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '@api/shared/infrastructure/auth';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Health check',
    description:
      'Returns the current health status of the API. This endpoint is unauthenticated and suitable for load balancer probes.'
  })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  live() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'bezoom-api'
    };
  }

  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({ status: 200, description: 'API process is alive' })
  liveness() {
    return this.live();
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe' })
  @ApiResponse({ status: 200, description: 'Required dependencies are reachable' })
  @ApiResponse({ status: 503, description: 'At least one required dependency is unavailable' })
  async readiness() {
    const result = await this.health.readiness();
    if (!result.ready) {
      const dependencies = Object.entries(result.checks)
        .filter(([, status]) => status === 'down')
        .map(([name]) => name);
      throw new ServiceUnavailableException({
        code: 'DEPENDENCY_UNAVAILABLE',
        details: { dependencies }
      });
    }
    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
      service: 'bezoom-api',
      checks: result.checks
    };
  }
}
