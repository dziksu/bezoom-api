import { pgTable, text, timestamp, uuid, varchar, boolean, integer } from 'drizzle-orm/pg-core';

/**
 * User Profiles Table
 * Stores individual user profile information
 * Supports both personal and business profiles
 */
export const profiles = pgTable('profiles', {
  // Primary identifiers
  id: uuid('id').defaultRandom().primaryKey(),
  keycloakSub: text('keycloak_sub').notNull().unique(),

  // Account type: 'personal' or 'business'
  accountType: varchar('account_type', { length: 20 }).notNull().default('personal'),

  // Basic information
  firstName: text('first_name'),
  lastName: text('last_name'),
  username: text('username').unique(), // Optional unique username
  email: text('email'),
  phoneNumber: text('phone_number'), // Verified phone number

  // Profile content
  bio: text('bio'), // Short bio/description
  avatarUrl: text('avatar_url'), // S3/MinIO URL to avatar
  avatarStoragePath: text('avatar_storage_path'), // Storage path for cleanup

  // Interests and tags
  interests: text('interests').array(), // Array of interest tags

  // Business/Company specific (if accountType === 'business')
  businessName: text('business_name'),
  nip: varchar('nip', { length: 10 }), // Polish tax ID (unique if business)
  businessDescription: text('business_description'),
  websiteUrl: text('website_url'),

  // Verification
  isPhoneVerified: boolean('is_phone_verified').notNull().default(false),
  phoneVerificationToken: text('phone_verification_token'),
  businessVerificationStatus: varchar('business_verification_status', {
    length: 20
  }).default('unverified'), // 'unverified', 'pending', 'verified', 'rejected'
  businessVerificationDate: timestamp('business_verification_date', { withTimezone: true }),

  // Social metrics
  followersCount: integer('followers_count').notNull().default(0),
  followingCount: integer('following_count').notNull().default(0),

  // Account settings
  isPrivate: boolean('is_private').notNull().default(false),
  isDeactivated: boolean('is_deactivated').notNull().default(false),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});
