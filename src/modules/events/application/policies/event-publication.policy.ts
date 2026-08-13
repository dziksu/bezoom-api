export type EventOrganizerEligibilityError =
  'PROFILE_ONBOARDING_REQUIRED' | 'PHONE_VERIFICATION_REQUIRED' | 'ACCOUNT_DEACTIVATED' | 'PERSONAL_ACCOUNT_REQUIRED';

/** Write-side organizer policy without coupling the event domain to user persistence. */
export abstract class EventPublicationPolicy {
  abstract getEligibilityError(organizerKeycloakSub: string): Promise<EventOrganizerEligibilityError | null>;
}
