export class GetEventViewerStateQuery {
  constructor(
    public readonly eventId: string,
    public readonly keycloakSub: string
  ) {}
}
