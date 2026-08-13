export class ListMyAttendingEventsQuery {
  constructor(
    public readonly keycloakSub: string,
    public readonly page: number,
    public readonly limit: number
  ) {}
}
