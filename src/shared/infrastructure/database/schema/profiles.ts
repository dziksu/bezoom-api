import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const profiles = pgTable('profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  keycloakSub: text('keycloak_sub').notNull().unique(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  bio: text('bio'),
  avatarUrl: text('avatar_url'),
  coverPhotoUrl: text('cover_photo_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});
