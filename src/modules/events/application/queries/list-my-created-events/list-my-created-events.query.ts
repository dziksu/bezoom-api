export class ListMyCreatedEventsQuery {
  constructor(
    public readonly organizerKeycloakSub: string,
    public readonly page: number,
    public readonly limit: number
  ) {}
}
