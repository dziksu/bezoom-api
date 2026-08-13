import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { inArray, sql } from 'drizzle-orm';
import type { EventPipelineConfig } from '@api/shared/infrastructure/config/event-pipeline.config';
import { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';
import { eventOutbox } from '@api/shared/infrastructure/database/schema';
import { QueueName } from '@api/shared/infrastructure/queue/queue-names';
import type { EventPipelineJob } from './event-pipeline.processor';

interface ClaimedOutboxRow {
  id: string;
  aggregate_id: string;
}

/** Reliably bridges the PostgreSQL outbox to BullMQ. Job IDs make retries idempotent. */
@Injectable()
export class EventPipelineOutboxDispatcher implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(EventPipelineOutboxDispatcher.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly writeService: DrizzleWriteService,
    private readonly config: ConfigService,
    @InjectQueue(QueueName.MEDIA_MODERATION) private readonly queue: Queue<EventPipelineJob>
  ) {}

  onApplicationBootstrap(): void {
    const pipeline = this.config.get<EventPipelineConfig>('eventPipeline');
    if (pipeline?.mode !== 'development_passthrough') return;
    const intervalMs = pipeline?.dispatchIntervalMs ?? 500;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async dispatchNextBatch(limit = 25): Promise<number> {
    const safeLimit = Math.max(1, Math.min(limit, 100));

    return this.writeService.db.transaction(async (tx) => {
      const result: unknown = await tx.execute(sql`
        SELECT id, aggregate_id
        FROM event_outbox
        WHERE processed_at IS NULL
          AND event_type = 'event.created'
        ORDER BY occurred_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT ${safeLimit}
      `);
      const rows = (result as { rows: ClaimedOutboxRow[] }).rows;

      for (const row of rows) {
        await this.queue.add(
          'process-event',
          { eventId: row.aggregate_id },
          {
            jobId: `event-created-${row.id}`,
            attempts: 5,
            backoff: { type: 'exponential', delay: 1_000 },
            removeOnComplete: { age: 86_400, count: 10_000 },
            removeOnFail: { age: 604_800, count: 10_000 }
          }
        );
      }

      if (rows.length > 0) {
        const ids = rows.map((row) => row.id);
        await tx
          .update(eventOutbox)
          .set({ processedAt: new Date(), attempts: sql`${eventOutbox.attempts} + 1` })
          .where(inArray(eventOutbox.id, ids));
      }

      return rows.length;
    });
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      let dispatched: number;
      do {
        dispatched = await this.dispatchNextBatch();
      } while (dispatched === 25);
    } catch (error) {
      this.logger.error('EVENT_PIPELINE_DISPATCH_FAILED', error instanceof Error ? error.stack : undefined);
    } finally {
      this.running = false;
    }
  }
}
