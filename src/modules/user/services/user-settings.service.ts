import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';
import { userSettings } from '@api/shared/infrastructure/database/schema/user-settings';
import { AccountTheme, UpdateUserSettingsDto, UserSettingsResponseDto } from '../dto/user-settings.dto';
import { ProfileService } from './profile.service';

type UserSettingsRecord = typeof userSettings.$inferSelect;

@Injectable()
export class UserSettingsService {
  constructor(
    private readonly write: DrizzleWriteService,
    private readonly profiles: ProfileService
  ) {}

  async getSettings(
    keycloakSub: string,
    email?: string,
    firstName?: string,
    lastName?: string,
    identityIssuedAt?: number,
    emailVerified?: boolean
  ): Promise<UserSettingsResponseDto> {
    const profile = await this.profiles.getMyProfile(
      keycloakSub,
      email,
      firstName,
      lastName,
      identityIssuedAt,
      emailVerified
    );
    return this.toResponse(await this.getOrCreate(profile.id));
  }

  async updateSettings(
    keycloakSub: string,
    update: UpdateUserSettingsDto,
    email?: string,
    firstName?: string,
    lastName?: string,
    identityIssuedAt?: number,
    emailVerified?: boolean
  ): Promise<UserSettingsResponseDto> {
    const profile = await this.profiles.getMyProfile(
      keycloakSub,
      email,
      firstName,
      lastName,
      identityIssuedAt,
      emailVerified
    );
    const changes = this.toChanges(update);
    if (Object.keys(changes).length === 0) return this.toResponse(await this.getOrCreate(profile.id));

    const [settings] = await this.write.db
      .insert(userSettings)
      .values({ profileId: profile.id, ...changes })
      .onConflictDoUpdate({
        target: userSettings.profileId,
        set: { ...changes, updatedAt: new Date() }
      })
      .returning();

    return this.toResponse(settings);
  }

  private async getOrCreate(profileId: string): Promise<UserSettingsRecord> {
    const [created] = await this.write.db
      .insert(userSettings)
      .values({ profileId })
      .onConflictDoNothing({ target: userSettings.profileId })
      .returning();
    if (created) return created;

    const [existing] = await this.write.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.profileId, profileId))
      .limit(1);
    return existing;
  }

  private toChanges(update: UpdateUserSettingsDto): Partial<typeof userSettings.$inferInsert> {
    return {
      ...(update.theme !== undefined && { theme: update.theme }),
      ...(update.eventRemindersEnabled !== undefined && { eventRemindersEnabled: update.eventRemindersEnabled }),
      ...(update.nearbyEventsEnabled !== undefined && { nearbyEventsEnabled: update.nearbyEventsEnabled }),
      ...(update.socialActivityEnabled !== undefined && { socialActivityEnabled: update.socialActivityEnabled }),
      ...(update.language !== undefined && { language: update.language }),
      ...(update.country !== undefined && { country: update.country }),
      ...(update.currency !== undefined && { currency: update.currency }),
      ...(update.timeZone !== undefined && { timeZone: update.timeZone })
    };
  }

  private toResponse(settings: UserSettingsRecord): UserSettingsResponseDto {
    return {
      theme: settings.theme as AccountTheme,
      eventRemindersEnabled: settings.eventRemindersEnabled,
      nearbyEventsEnabled: settings.nearbyEventsEnabled,
      socialActivityEnabled: settings.socialActivityEnabled,
      language: settings.language,
      country: settings.country,
      currency: settings.currency,
      timeZone: settings.timeZone,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt
    };
  }
}
