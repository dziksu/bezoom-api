import { events, locations, eventPhotos } from '@api/shared/infrastructure/database/schema';
import { Event } from '../../domain/event.aggregate';

type NewEventRow = typeof events.$inferInsert;
type NewLocationRow = typeof locations.$inferInsert;

export class EventMapper {
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
