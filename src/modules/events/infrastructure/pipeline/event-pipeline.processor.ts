import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { QueueName } from '@api/shared/infrastructure/queue/queue-names';
import { EventPipelineService } from './event-pipeline.service';

export interface EventPipelineJob {
  eventId: string;
}

@Processor(QueueName.MEDIA_MODERATION, { concurrency: 2 })
export class EventPipelineProcessor extends WorkerHost {
  constructor(private readonly pipeline: EventPipelineService) {
    super();
  }

  async process(job: Job<EventPipelineJob>): Promise<void> {
    if (job.name !== 'process-event') throw new Error('EVENT_PIPELINE_JOB_UNSUPPORTED');
    if (!job.data.eventId) throw new Error('EVENT_PIPELINE_JOB_INVALID');
    await this.pipeline.process(job.data.eventId);
  }
}
