import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';
import { JsonLoggerService } from './json-logger.service';

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(
    private readonly metrics: MetricsService,
    private readonly logger: JsonLoggerService
  ) {}

  use(request: Request, response: Response, next: NextFunction): void {
    if (request.path.endsWith('/metrics')) {
      next();
      return;
    }

    const startedAt = process.hrtime.bigint();
    response.once('finish', () => {
      const route = this.resolveRoute(request);
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      this.metrics.observeHttpRequest(request.method, route, response.statusCode, durationSeconds);
      this.logger.httpRequest({
        method: request.method,
        route,
        statusCode: response.statusCode,
        durationMs: durationSeconds * 1_000
      });
    });
    next();
  }

  private resolveRoute(request: Request): string {
    const route = (request as unknown as { route?: unknown }).route;
    const routePath =
      typeof route === 'object' && route !== null && 'path' in route ? (route as { path?: unknown }).path : undefined;
    if (typeof routePath !== 'string') {
      return 'unmatched';
    }
    return `${request.baseUrl}${routePath}` || '/';
  }
}
