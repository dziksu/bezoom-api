import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';
import { RedisCacheService } from '@api/shared/infrastructure/cache/redis-cache.service';
import { backgroundWorkersEnabled, type RuntimeConfig } from '@api/shared/infrastructure/config/runtime.config';

/**
 * Durable event_stats projector contract.
 *
 * A BullMQ worker/scheduler can call this in batches. Claim, counter update and
 * outbox acknowledgement happen in one PostgreSQL transaction, so a worker
 * crash cannot acknowledge an event without applying it. SKIP LOCKED allows
 * multiple projector replicas to work concurrently.
 */
@Injectable()
export class EventStatsProjectionService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(EventStatsProjectionService.name);
  private timer?: NodeJS.Timeout;
  private inFlight?: Promise<void>;
  private shuttingDown = false;
  private nextCleanupAt = 0;

  constructor(
    private readonly writeService: DrizzleWriteService,
    private readonly cache: RedisCacheService,
    private readonly config: ConfigService
  ) {}

  onApplicationBootstrap(): void {
    if (!backgroundWorkersEnabled(this.config.get<RuntimeConfig>('runtime'))) return;
    const configured = Number(process.env.EVENT_STATS_PROJECTION_INTERVAL_MS ?? 250);
    const intervalMs = Number.isFinite(configured) ? Math.max(50, configured) : 250;

    this.triggerTick();
    this.timer = setInterval(() => this.triggerTick(), intervalMs);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    if (this.timer) clearInterval(this.timer);
    await this.inFlight;
  }

  private triggerTick(): void {
    if (this.shuttingDown || this.inFlight) return;
    const task = this.tick();
    this.inFlight = task;
    void task.finally(() => {
      if (this.inFlight === task) this.inFlight = undefined;
    });
  }

  private async tick(): Promise<void> {
    try {
      let projected: number;
      do {
        projected = await this.projectNextBatch();
      } while (projected === 100);
      await this.cleanupProcessedOutboxIfDue();
    } catch (error) {
      this.logger.error('EVENT_STATS_PROJECTION_FAILED', error instanceof Error ? error.stack : undefined);
    }
  }

  async projectNextBatch(limit = 100): Promise<number> {
    const safeLimit = Math.max(1, Math.min(limit, 1000));
    const candidateLimit = Math.min(safeLimit * 4, 4_000);

    const projection = await this.writeService.db.transaction(async (tx) => {
      const result: unknown = await tx.execute(sql`
        WITH candidates AS MATERIALIZED (
          SELECT id, aggregate_id, payload, occurred_at
          FROM event_outbox
          WHERE processed_at IS NULL
            AND event_type = 'event.stats.changed'
          ORDER BY occurred_at, id
          FOR UPDATE SKIP LOCKED
          LIMIT ${candidateLimit}
        ), candidate_aggregates AS MATERIALIZED (
          SELECT DISTINCT ON (aggregate_id) aggregate_id, occurred_at, id
          FROM candidates
          ORDER BY aggregate_id, occurred_at, id
        ), locked_aggregates AS MATERIALIZED (
          SELECT candidate.aggregate_id
          FROM candidate_aggregates candidate
          WHERE NOT EXISTS (
            SELECT 1
            FROM event_outbox earlier
            WHERE earlier.processed_at IS NULL
              AND earlier.event_type = 'event.stats.changed'
              AND earlier.aggregate_id = candidate.aggregate_id
              AND (earlier.occurred_at, earlier.id) < (candidate.occurred_at, candidate.id)
          )
            AND pg_try_advisory_xact_lock(hashtextextended(candidate.aggregate_id::text, 0))
        ), claimed AS MATERIALIZED (
          SELECT candidate.id, candidate.aggregate_id, candidate.payload, candidate.occurred_at
          FROM candidates candidate
          JOIN locked_aggregates locked USING (aggregate_id)
          ORDER BY candidate.occurred_at, candidate.id
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

      const rows = (result as { rows: Array<{ aggregate_id: string }> }).rows;
      return {
        eventIds: [...new Set(rows.map((row) => row.aggregate_id))],
        processedCount: rows.length
      };
    });
    await Promise.all(projection.eventIds.map((eventId) => this.cache.delete('event_detail', eventId)));
    return projection.processedCount;
  }

  async cleanupProcessedOutbox(limit = 5_000): Promise<number> {
    const safeLimit = Math.max(1, Math.min(limit, 10_000));
    const retentionDays = this.config.get<RuntimeConfig>('runtime')?.outboxRetentionDays ?? 7;
    const result: unknown = await this.writeService.db.execute(sql`
      WITH expired AS (
        SELECT id
        FROM event_outbox
        WHERE processed_at < now() - (${retentionDays} * interval '1 day')
        ORDER BY processed_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT ${safeLimit}
      )
      DELETE FROM event_outbox outbox
      USING expired
      WHERE outbox.id = expired.id
      RETURNING outbox.id
    `);
    return (result as { rows: Array<{ id: string }> }).rows.length;
  }

  private async cleanupProcessedOutboxIfDue(): Promise<void> {
    const now = Date.now();
    if (now < this.nextCleanupAt) return;
    this.nextCleanupAt = now + 60 * 60 * 1_000;
    let removed: number;
    do {
      removed = await this.cleanupProcessedOutbox();
    } while (removed === 5_000);
  }
}
