export class ArchiveEventCommand {
  constructor(
    public readonly eventId: string,
    public readonly organizerKeycloakSub: string
  ) {}
}
