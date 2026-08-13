export class ResubmitEventCommand {
  constructor(
    public readonly eventId: string,
    public readonly organizerKeycloakSub: string
  ) {}
}
