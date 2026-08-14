import { pgTable, uuid, text, integer, pgEnum, timestamp, index } from 'drizzle-orm/pg-core';
import { events } from './events';

export const eventPhotoStatusEnum = pgEnum('event_photo_status', ['PENDING_UPLOAD', 'UPLOADED', 'READY', 'REJECTED']);

// A photo row is created (PENDING_UPLOAD, eventId = null) when the client requests a
// presigned upload URL, then linked to an event (UPLOADED, eventId set) at event-creation time.
export const eventPhotos = pgTable(
  'event_photos',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
    ownerKeycloakSub: text('owner_keycloak_sub').notNull(),
    rawKey: text('raw_key').notNull(),
    mediaKey: text('media_key'),
    status: eventPhotoStatusEnum('status').default('PENDING_UPLOAD').notNull(),
    position: integer('position'),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    index('event_photos_event_id_idx').on(t.eventId),
    index('event_photos_owner_event_idx').on(t.ownerKeycloakSub, t.eventId),
    index('event_photos_ready_position_idx').on(t.eventId, t.status, t.position)
  ]
);
