export class BlockUserCommand {
  constructor(
    public readonly blockerKeycloakSub: string,
    public readonly blockedProfileId: string
  ) {}
}
