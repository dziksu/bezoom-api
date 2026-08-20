import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  private readonly httpRequests: Counter<'method' | 'route' | 'status_code'>;
  private readonly httpDuration: Histogram<'method' | 'route' | 'status_code'>;
  private readonly httpResponseSize: Histogram<'method' | 'route' | 'status_code'>;
  private readonly cacheOperations: Counter<'cache' | 'result'>;
  private readonly databasePoolConnections: Gauge<'pool' | 'state'>;
  private readonly outboxPending: Gauge;
  private readonly outboxOldestAge: Gauge;

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
    this.httpResponseSize = new Histogram({
      name: 'bezoom_http_response_size_bytes',
      help: 'HTTP response size reported by Content-Length.',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [512, 2_048, 8_192, 32_768, 131_072, 524_288, 2_097_152, 8_388_608],
      registers: [this.registry]
    });
    this.cacheOperations = new Counter({
      name: 'bezoom_cache_operations_total',
      help: 'Cache operations split by low-cardinality cache namespace and result.',
      labelNames: ['cache', 'result'],
      registers: [this.registry]
    });
    this.databasePoolConnections = new Gauge({
      name: 'bezoom_database_pool_connections',
      help: 'Current node-postgres pool connections by state.',
      labelNames: ['pool', 'state'],
      registers: [this.registry]
    });
    this.outboxPending = new Gauge({
      name: 'bezoom_event_outbox_pending',
      help: 'Number of unprocessed event outbox rows.',
      registers: [this.registry]
    });
    this.outboxOldestAge = new Gauge({
      name: 'bezoom_event_outbox_oldest_pending_age_seconds',
      help: 'Age of the oldest unprocessed event outbox row.',
      registers: [this.registry]
    });
  }

  observeHttpRequest(method: string, route: string, statusCode: number, durationSeconds: number): void {
    const labels = { method, route, status_code: String(statusCode) };
    this.httpRequests.inc(labels);
    this.httpDuration.observe(labels, durationSeconds);
  }

  observeHttpResponseSize(method: string, route: string, statusCode: number, sizeBytes: number): void {
    this.httpResponseSize.observe({ method, route, status_code: String(statusCode) }, sizeBytes);
  }

  observeCacheOperation(cache: string, result: 'delete' | 'error' | 'hit' | 'miss' | 'write'): void {
    this.cacheOperations.inc({ cache, result });
  }

  setDatabasePool(pool: 'read' | 'write', stats: { total: number; idle: number; waiting: number }): void {
    this.databasePoolConnections.set({ pool, state: 'total' }, stats.total);
    this.databasePoolConnections.set({ pool, state: 'idle' }, stats.idle);
    this.databasePoolConnections.set({ pool, state: 'waiting' }, stats.waiting);
  }

  setOutbox(pending: number, oldestPendingAgeSeconds: number): void {
    this.outboxPending.set(pending);
    this.outboxOldestAge.set(oldestPendingAgeSeconds);
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }
}
