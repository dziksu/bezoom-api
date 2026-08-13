import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '@api/shared/infrastructure/auth';
import { MetricsService } from './metrics.service';

@Public()
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    return this.metrics.render();
  }
}
