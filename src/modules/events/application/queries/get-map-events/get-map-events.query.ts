export class GetMapEventsQuery {
  constructor(
    public readonly west: number,
    public readonly south: number,
    public readonly east: number,
    public readonly north: number,
    public readonly zoom: number,
    public readonly week: number | undefined,
    public readonly viewerKeycloakSub?: string
  ) {}
}
