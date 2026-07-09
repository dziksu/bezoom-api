import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const businesses = pgTable('businesses', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().unique(),
  name: text('name').notNull(),
  nip: text('nip').unique(),
  krs: text('krs'),
  regon: text('regon'),
  status: text('status', {
    enum: ['PENDING', 'VERIFIED', 'REJECTED']
  })
    .notNull()
    .default('PENDING'),
  logoUrl: text('logo_url'),
  website: text('website'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  verifiedBy: uuid('verified_by'),
  verificationData: jsonb('verification_data'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});
