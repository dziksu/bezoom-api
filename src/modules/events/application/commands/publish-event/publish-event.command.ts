export class PublishEventCommand {
  constructor(
    public readonly eventId: string,
    public readonly organizerKeycloakSub: string
  ) {}
}
