export class ListMyCreatedEventsQuery {
  constructor(
    public readonly organizerKeycloakSub: string,
    public readonly cursor: string | undefined,
    public readonly limit: number
  ) {}
}
