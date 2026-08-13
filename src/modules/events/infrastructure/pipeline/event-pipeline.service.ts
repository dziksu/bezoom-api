import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ObjectStorageService } from '@api/shared/infrastructure/storage/object-storage.service';
import type { EventPipelineConfig } from '@api/shared/infrastructure/config/event-pipeline.config';
import { EventRepository } from '../../domain/event.repository';
import { RedisCacheService } from '@api/shared/infrastructure/cache/redis-cache.service';

const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Local MVP pipeline. It deliberately refuses to run in production: production
 * must replace this passthrough with content moderation and decode/re-encode workers.
 */
@Injectable()
export class EventPipelineService {
  private readonly logger = new Logger(EventPipelineService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly repository: EventRepository,
    private readonly storage: ObjectStorageService,
    private readonly cache: RedisCacheService
  ) {}

  async process(eventId: string): Promise<void> {
    this.assertDevelopmentMode();

    const event = await this.repository.findById(eventId);
    if (!event || event.status === 'REJECTED' || event.status === 'CANCELLED') return;
    if (event.status === 'READY' || event.status === 'PUBLISHED') return;

    for (const photo of event.photos) {
      if (photo.status === 'READY' && photo.mediaKey) continue;

      const raw = await this.storage.statObject(this.storage.rawBucket, photo.rawKey);
      if (!raw) throw new Error('EVENT_PHOTO_NOT_UPLOADED');
      if (raw.size > MAX_PHOTO_SIZE_BYTES) throw new Error('EVENT_PHOTO_TOO_LARGE');
      if (raw.mimeType && raw.mimeType !== photo.mimeType) throw new Error('EVENT_PHOTO_MIME_MISMATCH');

      const mediaKey = `events/${event.id}/${photo.id}.${this.extensionFor(photo.mimeType)}`;
      const alreadyCopied = await this.storage.statObject(this.storage.mediaBucket, mediaKey);
      if (!alreadyCopied) {
        await this.storage.copyObject(this.storage.rawBucket, photo.rawKey, this.storage.mediaBucket, mediaKey);
      }
      event.markPhotoReady(photo.id, mediaKey);
    }

    event.verify();
    event.markReady();
    await this.repository.updateLifecycle(event);
    await this.cache.delete('event_detail', event.id);

    this.logger.log('EVENT_PIPELINE_READY');
  }

  private assertDevelopmentMode(): void {
    const pipeline = this.config.get<EventPipelineConfig>('eventPipeline');
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    if (pipeline?.mode !== 'development_passthrough' || nodeEnv === 'production') {
      throw new ServiceUnavailableException('EVENT_PIPELINE_NOT_CONFIGURED');
    }
  }

  private extensionFor(mimeType: string): string {
    const extensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif'
    };
    const extension = extensions[mimeType];
    if (!extension) throw new Error('EVENT_PHOTO_TYPE_INVALID');
    return extension;
  }
}
