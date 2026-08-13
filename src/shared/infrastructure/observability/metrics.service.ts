import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  private readonly httpRequests: Counter<'method' | 'route' | 'status_code'>;
  private readonly httpDuration: Histogram<'method' | 'route' | 'status_code'>;
  private readonly cacheOperations: Counter<'cache' | 'result'>;

  constructor() {
    this.registry.setDefaultLabels({ service: 'bezoom-api' });
    collectDefaultMetrics({ register: this.registry, prefix: 'bezoom_' });

    this.httpRequests = new Counter({
      name: 'bezoom_http_requests_total',
      help: 'Total number of completed HTTP requests.',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry]
    });
    this.httpDuration = new Histogram({
      name: 'bezoom_http_request_duration_seconds',
      help: 'HTTP request duration in seconds.',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry]
    });
    this.cacheOperations = new Counter({
      name: 'bezoom_cache_operations_total',
      help: 'Cache operations split by low-cardinality cache namespace and result.',
      labelNames: ['cache', 'result'],
      registers: [this.registry]
    });
  }

  observeHttpRequest(method: string, route: string, statusCode: number, durationSeconds: number): void {
    const labels = { method, route, status_code: String(statusCode) };
    this.httpRequests.inc(labels);
    this.httpDuration.observe(labels, durationSeconds);
  }

  observeCacheOperation(cache: string, result: 'error' | 'hit' | 'miss' | 'write'): void {
    this.cacheOperations.inc({ cache, result });
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }
}
