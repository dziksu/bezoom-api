import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';
import { RedisCacheService } from '@api/shared/infrastructure/cache/redis-cache.service';

/**
 * Durable event_stats projector contract.
 *
 * A BullMQ worker/scheduler can call this in batches. Claim, counter update and
 * outbox acknowledgement happen in one PostgreSQL transaction, so a worker
 * crash cannot acknowledge an event without applying it. SKIP LOCKED allows
 * multiple projector replicas to work concurrently.
 */
@Injectable()
export class EventStatsProjectionService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(EventStatsProjectionService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly writeService: DrizzleWriteService,
    private readonly cache: RedisCacheService
  ) {}

  onApplicationBootstrap(): void {
    const configured = Number(process.env.EVENT_STATS_PROJECTION_INTERVAL_MS ?? 250);
    const intervalMs = Number.isFinite(configured) ? Math.max(50, configured) : 250;

    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    // Avoid overlapping batches in one process. SKIP LOCKED coordinates replicas.
    if (this.running) return;
    this.running = true;

    try {
      let projected: number;
      do {
        projected = await this.projectNextBatch();
      } while (projected === 100);
    } catch (error) {
      this.logger.error('EVENT_STATS_PROJECTION_FAILED', error instanceof Error ? error.stack : undefined);
    } finally {
      this.running = false;
    }
  }

  async projectNextBatch(limit = 100): Promise<number> {
    const safeLimit = Math.max(1, Math.min(limit, 1000));

    const aggregateIds = await this.writeService.db.transaction(async (tx) => {
      const result: unknown = await tx.execute(sql`
        WITH claimed AS (
          SELECT id, aggregate_id, payload
          FROM event_outbox
          WHERE processed_at IS NULL
            AND event_type = 'event.stats.changed'
            AND NOT EXISTS (
              SELECT 1
              FROM event_outbox earlier
              WHERE earlier.processed_at IS NULL
                AND earlier.event_type = 'event.stats.changed'
                AND earlier.aggregate_id = event_outbox.aggregate_id
                AND (earlier.occurred_at, earlier.id) < (event_outbox.occurred_at, event_outbox.id)
            )
          ORDER BY occurred_at, id
          FOR UPDATE SKIP LOCKED
          LIMIT ${safeLimit}
        ), aggregated AS (
          SELECT
            aggregate_id,
            sum(coalesce((payload->>'likesDelta')::integer, 0))::integer AS likes_delta,
            sum(coalesce((payload->>'savesDelta')::integer, 0))::integer AS saves_delta,
            sum(coalesce((payload->>'attendingDelta')::integer, 0))::integer AS attending_delta,
            sum(coalesce((payload->>'commentsDelta')::integer, 0))::integer AS comments_delta
          FROM claimed
          GROUP BY aggregate_id
        ), projected AS (
          UPDATE event_stats stats
          SET
            likes_count = greatest(0, stats.likes_count + aggregated.likes_delta),
            saves_count = greatest(0, stats.saves_count + aggregated.saves_delta),
            attending_count = greatest(0, stats.attending_count + aggregated.attending_delta),
            comments_count = greatest(0, stats.comments_count + aggregated.comments_delta),
            updated_at = now()
          FROM aggregated
          WHERE stats.event_id = aggregated.aggregate_id
          RETURNING stats.event_id
        )
        UPDATE event_outbox outbox
        SET processed_at = now(), attempts = attempts + 1
        WHERE outbox.id IN (SELECT id FROM claimed)
        RETURNING outbox.aggregate_id
      `);

      return (result as { rows: Array<{ aggregate_id: string }> }).rows.map((row) => row.aggregate_id);
    });
    await Promise.all(aggregateIds.map((eventId) => this.cache.delete('event_detail', eventId)));
    return aggregateIds.length;
  }
}
