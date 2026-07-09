import { pgTable, uuid, text, decimal } from 'drizzle-orm/pg-core';

export const locations = pgTable('locations', {
  id: uuid('id').defaultRandom().primaryKey(),
  latitude: decimal('latitude', { precision: 10, scale: 7 }).notNull(),
  longitude: decimal('longitude', { precision: 10, scale: 7 }).notNull(),
  address: text('address'),
  city: text('city'),
  country: text('country').default('PL'),
  eventId: uuid('event_id').notNull().unique()
});
