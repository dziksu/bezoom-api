import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { QueueName } from '@api/shared/infrastructure/queue/queue-names';
import { backgroundWorkersEnabled, type RuntimeConfig } from '@api/shared/infrastructure/config/runtime.config';
import { EventPipelineService } from './event-pipeline.service';

export interface EventPipelineJob {
  eventId: string;
}

@Processor(QueueName.MEDIA_MODERATION, { concurrency: 2, autorun: false })
export class EventPipelineProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(EventPipelineProcessor.name);

  constructor(
    private readonly pipeline: EventPipelineService,
    private readonly config: ConfigService
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    if (!backgroundWorkersEnabled(this.config.get<RuntimeConfig>('runtime'))) return;
    void this.worker.run().catch((error: unknown) => {
      this.logger.error('EVENT_PIPELINE_WORKER_FAILED', error instanceof Error ? error.stack : undefined);
    });
  }

  async process(job: Job<EventPipelineJob>): Promise<void> {
    if (job.name !== 'process-event') throw new Error('EVENT_PIPELINE_JOB_UNSUPPORTED');
    if (!job.data.eventId) throw new Error('EVENT_PIPELINE_JOB_INVALID');
    await this.pipeline.process(job.data.eventId);
  }
}
