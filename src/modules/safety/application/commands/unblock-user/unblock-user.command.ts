export class UnblockUserCommand {
  constructor(
    public readonly blockerKeycloakSub: string,
    public readonly blockedProfileId: string
  ) {}
}
