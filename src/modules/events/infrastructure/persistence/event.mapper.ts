import { events, locations, eventPhotos } from '@api/shared/infrastructure/database/schema';
import { Event, type EventProps } from '../../domain/event.aggregate';
import { EventPhoto } from '../../domain/event-photo.entity';
import { EventPeriod } from '../../domain/value-objects/event-period.vo';
import { EventLocation } from '../../domain/value-objects/event-location.vo';
import { Price } from '../../domain/value-objects/price.vo';

type NewEventRow = typeof events.$inferInsert;
type NewLocationRow = typeof locations.$inferInsert;
type EventRow = typeof events.$inferSelect;
type LocationRow = typeof locations.$inferSelect;
type PhotoRow = typeof eventPhotos.$inferSelect;

export class EventMapper {
  static toDomain(event: EventRow, location: LocationRow, photos: PhotoRow[]): Event {
    const props: EventProps = {
      title: event.title,
      description: event.description,
      category: event.category,
      period: EventPeriod.reconstitute(event.startDate, event.endDate ?? undefined),
      organizerKeycloakSub: event.organizerKeycloakSub,
      location: EventLocation.create({
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
        address: location.address ?? undefined,
        city: location.city ?? undefined,
        country: location.country ?? 'PL'
      }),
      price: Price.create({
        priceType: event.priceType ?? 'FREE',
        priceMin: event.priceMin === null ? undefined : Number(event.priceMin),
        priceMax: event.priceMax === null ? undefined : Number(event.priceMax),
        currency: event.currency ?? 'PLN',
        ticketUrl: event.ticketUrl ?? undefined,
        priceNotes: event.priceNotes ?? undefined
      }),
      amenities: event.amenities ?? [],
      photos: photos.map((photo) =>
        EventPhoto.reconstitute({
          id: photo.id,
          rawKey: photo.rawKey,
          mediaKey: photo.mediaKey ?? undefined,
          position: photo.position ?? 0,
          mimeType: photo.mimeType,
          sizeBytes: photo.sizeBytes ?? undefined,
          status: photo.status
        })
      ),
      status: event.status,
      mediaPipelineStatus: event.mediaPipelineStatus ?? 'UPLOADED',
      visibility: event.visibility,
      radiusKm: event.radiusKm,
      verificationStatus: event.verificationStatus,
      verificationRejectionReason: event.verificationRejectionReason ?? undefined,
      verifiedAt: event.verifiedAt ?? undefined,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt
    };

    return Event.reconstitute(props, event.id);
  }

  static toEventRow(event: Event): NewEventRow {
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      category: event.category,
      startDate: event.period.startDate,
      endDate: event.period.endDate,
      organizerKeycloakSub: event.organizerKeycloakSub,
      priceType: event.price.priceType,
      priceMin: event.price.priceMin?.toString(),
      priceMax: event.price.priceMax?.toString(),
      currency: event.price.currency,
      ticketUrl: event.price.ticketUrl,
      priceNotes: event.price.priceNotes,
      amenities: event.amenities,
      status: event.status,
      mediaPipelineStatus: event.mediaPipelineStatus,
      visibility: event.visibility,
      radiusKm: event.radiusKm,
      verificationStatus: event.verificationStatus,
      verificationRejectionReason: event.verificationRejectionReason,
      verifiedAt: event.verifiedAt,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt
    };
  }

  static toLocationRow(event: Event): NewLocationRow {
    return {
      eventId: event.id,
      latitude: event.location.coordinates.latitude.toString(),
      longitude: event.location.coordinates.longitude.toString(),
      address: event.location.address,
      city: event.location.city,
      country: event.location.country
    };
  }

  static toPhotoUpdateRows(event: Event): Array<Partial<typeof eventPhotos.$inferInsert> & { id: string }> {
    return event.photos.map((photo) => ({
      id: photo.id,
      eventId: event.id,
      mediaKey: photo.mediaKey,
      position: photo.position,
      sizeBytes: photo.sizeBytes,
      status: photo.status
    }));
  }
}
