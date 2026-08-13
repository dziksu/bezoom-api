export class ListEventCommentsQuery {
  constructor(
    public readonly eventId: string,
    public readonly cursor: string | undefined,
    public readonly limit: number,
    public readonly viewerKeycloakSub?: string
  ) {}
}

export class ListEventLikesQuery {
  constructor(
    public readonly eventId: string,
    public readonly cursor: string | undefined,
    public readonly limit: number,
    public readonly viewerKeycloakSub?: string
  ) {}
}

export class ListEventParticipantsQuery {
  constructor(
    public readonly eventId: string,
    public readonly cursor: string | undefined,
    public readonly limit: number,
    public readonly viewerKeycloakSub?: string
  ) {}
}
