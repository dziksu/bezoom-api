import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';
import { profiles } from '@api/shared/infrastructure/database/schema';
import {
  EventPublicationPolicy,
  type EventOrganizerEligibilityError
} from '../../application/policies/event-publication.policy';

@Injectable()
export class DrizzleEventPublicationPolicy extends EventPublicationPolicy {
  constructor(private readonly writeService: DrizzleWriteService) {
    super();
  }

  async getEligibilityError(organizerKeycloakSub: string): Promise<EventOrganizerEligibilityError | null> {
    // Authorization decisions must use the primary: a read replica may lag
    // immediately after successful phone verification.
    const [profile] = await this.writeService.db
      .select({
        username: profiles.username,
        accountType: profiles.accountType,
        isPhoneVerified: profiles.isPhoneVerified,
        isDeactivated: profiles.isDeactivated
      })
      .from(profiles)
      .where(eq(profiles.keycloakSub, organizerKeycloakSub))
      .limit(1);

    if (!profile || !profile.username) return 'PROFILE_ONBOARDING_REQUIRED';
    if (profile.isDeactivated) return 'ACCOUNT_DEACTIVATED';
    if (profile.accountType !== 'personal') return 'PERSONAL_ACCOUNT_REQUIRED';
    if (!profile.isPhoneVerified) return 'PHONE_VERIFICATION_REQUIRED';
    return null;
  }
}
