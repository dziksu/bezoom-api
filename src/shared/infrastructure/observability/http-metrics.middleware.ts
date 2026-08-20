import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';
import { JsonLoggerService } from './json-logger.service';

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  private readonly successLogSampleRate: number;

  constructor(
    private readonly metrics: MetricsService,
    private readonly logger: JsonLoggerService,
    config: ConfigService
  ) {
    const fallback = config.get<string>('NODE_ENV', 'development') === 'production' ? 0.01 : 1;
    const configured = Number(config.get<string>('HTTP_SUCCESS_LOG_SAMPLE_RATE', String(fallback)));
    this.successLogSampleRate = Number.isFinite(configured) ? Math.max(0, Math.min(1, configured)) : fallback;
  }

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
      const contentLength = Number(response.getHeader('content-length'));
      if (Number.isFinite(contentLength) && contentLength >= 0) {
        this.metrics.observeHttpResponseSize(request.method, route, response.statusCode, contentLength);
      }
      if (this.shouldLogRequest(route, response.statusCode, durationSeconds)) {
        this.logger.httpRequest({
          method: request.method,
          route,
          statusCode: response.statusCode,
          durationMs: durationSeconds * 1_000
        });
      }
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

  private shouldLogRequest(route: string, statusCode: number, durationSeconds: number): boolean {
    if (statusCode >= 400 || durationSeconds >= 0.5) return true;
    if (route === '/api/health/live') return false;
    return Math.random() < this.successLogSampleRate;
  }
}
