export class ListMyLikedEventsQuery {
  constructor(
    public readonly keycloakSub: string,
    public readonly page: number,
    public readonly limit: number
  ) {}
}
