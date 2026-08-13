export class SearchEventsByLocationQuery {
  constructor(
    public readonly lat: number,
    public readonly lng: number,
    public readonly week: number | undefined,
    public readonly cursor: string | undefined,
    public readonly limit: number,
    public readonly viewerKeycloakSub?: string
  ) {}
}
