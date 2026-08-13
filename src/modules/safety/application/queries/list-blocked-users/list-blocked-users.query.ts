export class ListBlockedUsersQuery {
  constructor(
    public readonly blockerKeycloakSub: string,
    public readonly cursor: string | undefined,
    public readonly limit: number
  ) {}
}
