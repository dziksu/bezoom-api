import { Global, MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { HttpMetricsMiddleware } from './http-metrics.middleware';
import { JsonLoggerService } from './json-logger.service';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { RequestContextMiddleware } from './request-context.middleware';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [JsonLoggerService, MetricsService],
  exports: [JsonLoggerService, MetricsService]
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware, HttpMetricsMiddleware)
      .forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
  }
}
