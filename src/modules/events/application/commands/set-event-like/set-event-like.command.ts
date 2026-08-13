export class SetEventLikeCommand {
  constructor(
    public readonly eventId: string,
    public readonly keycloakSub: string,
    public readonly liked: boolean
  ) {}
}
