import { randomUUID } from 'crypto';
import { BadRequestException, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ObjectStorageService } from '@api/shared/infrastructure/storage/object-storage.service';
import { EventRepository } from '../../../domain/event.repository';
import { Event } from '../../../domain/event.aggregate';
import { DomainValidationError } from '../../../domain/events.errors';
import { CreateEventCommand } from './create-event.command';
import type { EventResponseDto } from '../../dto/event-response.dto';

const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;

@CommandHandler(CreateEventCommand)
export class CreateEventHandler implements ICommandHandler<CreateEventCommand, EventResponseDto> {
  private readonly logger = new Logger(CreateEventHandler.name);

  constructor(
    private readonly eventRepository: EventRepository,
    private readonly objectStorage: ObjectStorageService
  ) {}

  async execute(command: CreateEventCommand): Promise<EventResponseDto> {
    const pendingPhotos = await this.eventRepository.findPendingPhotosByIds(
      command.photoIds,
      command.organizerKeycloakSub
    );

    if (pendingPhotos.length !== command.photoIds.length) {
      throw new BadRequestException('EVENT_PHOTO_IDS_INVALID');
    }
    // Preserve the client-specified ordering for photo `position`.
    const byId = new Map(pendingPhotos.map((p) => [p.id, p]));
    const orderedPhotos = command.photoIds.map((id) => byId.get(id)!);

    const eventId = randomUUID();
    const linkedPhotos = await Promise.all(
      orderedPhotos.map(async (photo) => {
        const stat = await this.objectStorage.statObject(this.objectStorage.rawBucket, photo.rawKey);
        if (!stat) {
          throw new BadRequestException('EVENT_PHOTO_NOT_UPLOADED');
        }
        if (stat.size > MAX_PHOTO_SIZE_BYTES) {
          throw new BadRequestException('EVENT_PHOTO_TOO_LARGE');
        }

        return { id: photo.id, rawKey: photo.rawKey, mimeType: photo.mimeType, sizeBytes: stat.size };
      })
    );

    let event: Event;
    try {
      event = Event.create(
        {
          title: command.title,
          description: command.description,
          category: command.category,
          startDate: new Date(command.startDate),
          endDate: command.endDate ? new Date(command.endDate) : undefined,
          organizerKeycloakSub: command.organizerKeycloakSub,
          location: command.location,
          price: {
            priceType: command.priceType,
            priceMin: command.priceMin,
            priceMax: command.priceMax,
            currency: command.currency,
            ticketUrl: command.ticketUrl,
            priceNotes: command.priceNotes
          },
          amenities: command.amenities,
          visibility: command.visibility,
          photos: linkedPhotos
        },
        eventId
      );
    } catch (error) {
      if (error instanceof DomainValidationError) {
        throw new BadRequestException(error.code);
      }
      throw error;
    }

    await this.eventRepository.save(event);
    event.clearEvents();

    this.logger.log('EVENT_CREATED');

    return {
      id: event.id,
      title: event.title,
      description: event.description,
      category: event.category,
      startDate: event.period.startDate,
      endDate: event.period.endDate,
      latitude: event.location.coordinates.latitude,
      longitude: event.location.coordinates.longitude,
      address: event.location.address,
      city: event.location.city,
      country: event.location.country,
      priceType: event.price.priceType,
      priceMin: event.price.priceMin,
      priceMax: event.price.priceMax,
      currency: event.price.currency,
      ticketUrl: event.price.ticketUrl,
      priceNotes: event.price.priceNotes,
      amenities: event.amenities,
      // Raw uploads remain private until moderation/media processing marks them READY.
      photos: [],
      status: event.status,
      visibility: event.visibility,
      verificationStatus: event.verificationStatus,
      verificationRejectionReason: event.verificationRejectionReason,
      createdAt: event.createdAt
    };
  }
}
