import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';
import { profiles } from '@api/shared/infrastructure/database/schema';
import { EventPublicationPolicy } from '../../application/policies/event-publication.policy';

@Injectable()
export class DrizzleEventPublicationPolicy extends EventPublicationPolicy {
  constructor(private readonly writeService: DrizzleWriteService) {
    super();
  }

  async canPublish(organizerKeycloakSub: string): Promise<boolean> {
    // Authorization decisions must use the primary: a read replica may lag
    // immediately after successful phone verification.
    const [profile] = await this.writeService.db
      .select({ id: profiles.id })
      .from(profiles)
      .where(
        and(
          eq(profiles.keycloakSub, organizerKeycloakSub),
          eq(profiles.accountType, 'personal'),
          eq(profiles.isPhoneVerified, true),
          eq(profiles.isDeactivated, false)
        )
      )
      .limit(1);

    return Boolean(profile);
  }
}
