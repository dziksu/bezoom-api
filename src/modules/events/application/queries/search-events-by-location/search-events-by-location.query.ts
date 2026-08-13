export class SearchEventsByLocationQuery {
  constructor(
    public readonly lat: number,
    public readonly lng: number,
    public readonly week: number | undefined,
    public readonly page: number,
    public readonly limit: number
  ) {}
}
