import { pgTable, uuid, text, decimal, customType, index } from 'drizzle-orm/pg-core';
import { sql, type SQL } from 'drizzle-orm';

// PostGIS geography(Point,4326) column, generated from latitude/longitude so it can never
// drift from them. drizzle-orm's built-in geometry() type emits `geometry`, not `geography`
// — we need `geography` so ST_DWithin/ST_Distance operate in meters directly.
const geographyPoint = customType<{ data: string }>({
  dataType: () => 'geography(Point,4326)'
});

export const locations = pgTable(
  'locations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    latitude: decimal('latitude', { precision: 10, scale: 7 }).notNull(),
    longitude: decimal('longitude', { precision: 10, scale: 7 }).notNull(),
    address: text('address'),
    city: text('city'),
    country: text('country').default('PL'),
    eventId: uuid('event_id').notNull().unique(),
    geog: geographyPoint('geog').generatedAlwaysAs(
      (): SQL => sql`(ST_SetSRID(ST_MakePoint(longitude::float8, latitude::float8), 4326)::geography)`
    )
  },
  (t) => [index('locations_geog_gist_idx').using('gist', t.geog)]
);
