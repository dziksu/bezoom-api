import type { RsvpStatus } from '../../../domain/engagement/rsvp-status';

export class SetRsvpCommand {
  constructor(
    public readonly eventId: string,
    public readonly keycloakSub: string,
    /** A status to join/update, or null to cancel (leave) the RSVP. */
    public readonly status: RsvpStatus | null
  ) {}
}
