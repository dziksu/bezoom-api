export class SetEventSaveCommand {
  constructor(
    public readonly eventId: string,
    public readonly keycloakSub: string,
    public readonly saved: boolean
  ) {}
}
