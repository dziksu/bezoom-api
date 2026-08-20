import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '@api/shared/infrastructure/auth';
import { MetricsService } from './metrics.service';
import { DrizzleReadService } from '../drizzle-read.service';
import { DrizzleWriteService } from '../drizzle-write.service';
import { sql } from 'drizzle-orm';

interface OutboxMetricsRow {
  pending: string | number;
  oldest_age_seconds: string | number | null;
}

@Public()
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly read: DrizzleReadService,
    private readonly write: DrizzleWriteService
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    await this.refreshInfrastructureMetrics();
    return this.metrics.render();
  }

  private async refreshInfrastructureMetrics(): Promise<void> {
    this.metrics.setDatabasePool('read', this.read.getPoolStats());
    this.metrics.setDatabasePool('write', this.write.getPoolStats());
    try {
      const result: unknown = await this.write.db.execute(sql`
        SELECT
          count(*)::int AS pending,
          coalesce(extract(epoch FROM (now() - min(occurred_at))), 0) AS oldest_age_seconds
        FROM event_outbox
        WHERE processed_at IS NULL
      `);
      const row = (result as { rows: OutboxMetricsRow[] }).rows[0];
      this.metrics.setOutbox(Number(row?.pending ?? 0), Number(row?.oldest_age_seconds ?? 0));
    } catch {
      // Metrics scraping remains available while readiness reports the database failure.
    }
  }
}
