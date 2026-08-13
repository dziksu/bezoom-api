/** Write-side policy used by event publication without coupling the domain to user persistence. */
export abstract class EventPublicationPolicy {
  abstract canPublish(organizerKeycloakSub: string): Promise<boolean>;
}
