import { pgTable, uuid, text, timestamp, decimal, integer, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { locations } from './locations';

// ── Enums ────────────────────────────────────────────────────────────────
export const eventCategoryEnum = pgEnum('event_category', [
  'ARTS_AND_CULTURE',
  'ENTERTAINMENT',
  'SPORT_AND_RECREATION',
  'EDUCATION_AND_DEVELOPMENT',
  'SOCIAL_MEETUPS',
  'FESTIVALS_AND_FAIRS',
  'TRADE_AND_MARKETS',
  'FAMILY_AND_KIDS',
  'BUSINESS_AND_CAREER',
  'COMMUNITY_AND_ACTIVISM',
  'MUSIC_AND_NIGHTLIFE',
  'HEALTH_AND_WELLNESS',
  'FOOD_AND_CULINARY'
]);

export const eventStatusEnum = pgEnum('event_status', ['DRAFT', 'PUBLISHED', 'CANCELLED']);

export const mediaPipelineStatusEnum = pgEnum('media_pipeline_status', [
  'UPLOADED',
  'REJECTED',
  'NEEDS_REVIEW',
  'APPROVED',
  'READY'
]);

export const visibilityEnum = pgEnum('visibility', ['PUBLIC', 'PRIVATE', 'FRIENDS_ONLY']);

export const priceTypeEnum = pgEnum('price_type', ['FREE', 'FIXED', 'RANGE', 'DONATION']);

// ── Table ────────────────────────────────────────────────────────────────
export const events = pgTable('events', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  category: eventCategoryEnum('category').notNull(),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }),
  organizerKeycloakSub: text('organizer_keycloak_sub').notNull(),
  imageUrl: text('image_url'),
  // Pricing
  priceType: priceTypeEnum('price_type'),
  priceMin: decimal('price_min', { precision: 10, scale: 2 }),
  priceMax: decimal('price_max', { precision: 10, scale: 2 }),
  currency: text('currency').default('PLN'),
  ticketUrl: text('ticket_url'),
  priceNotes: text('price_notes'),
  // Amenities
  amenities: text('amenities').array(),
  // Status
  status: eventStatusEnum('status').default('DRAFT').notNull(),
  mediaPipelineStatus: mediaPipelineStatusEnum('media_pipeline_status'),
  moderationScoreMax: decimal('moderation_score_max', {
    precision: 5,
    scale: 4
  }),
  moderatedAt: timestamp('moderated_at', { withTimezone: true }),
  // Visibility
  visibility: visibilityEnum('visibility').default('PUBLIC').notNull(),
  radiusKm: integer('radius_km').default(5),
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const eventsRelations = relations(events, ({ one }) => ({
  location: one(locations, {
    fields: [events.id],
    references: [locations.eventId]
  })
}));
