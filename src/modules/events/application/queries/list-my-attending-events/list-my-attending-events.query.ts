export class ListMyAttendingEventsQuery {
  constructor(
    public readonly keycloakSub: string,
    public readonly cursor: string | undefined,
    public readonly limit: number
  ) {}
}
