import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { profiles } from './profiles';

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    authentikId: text('authentik_id').notNull().unique(),
    nick: text('nick').notNull().unique(),
    email: text('email').notNull().unique(),
    phoneNumber: text('phone_number'),
    accountType: text('account_type', {
      enum: ['PRIVATE', 'BUSINESS']
    })
      .notNull()
      .default('PRIVATE'),
    phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastLogin: timestamp('last_login', { withTimezone: true }),
    profileId: uuid('profile_id')
  },
  (t) => [
    uniqueIndex('users_authentik_id_idx').on(t.authentikId),
    uniqueIndex('users_nick_idx').on(t.nick),
    uniqueIndex('users_email_idx').on(t.email)
  ]
);

export const usersRelations = relations(users, ({ one }) => ({
  profile: one(profiles, {
    fields: [users.profileId],
    references: [profiles.id]
  })
}));
