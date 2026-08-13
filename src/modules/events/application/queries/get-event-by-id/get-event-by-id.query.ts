export class GetEventByIdQuery {
  constructor(
    public readonly eventId: string,
    public readonly viewerKeycloakSub?: string
  ) {}
}
