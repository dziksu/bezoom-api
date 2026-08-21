export class SetEventCommentLikeCommand {
  constructor(
    public readonly eventId: string,
    public readonly commentId: string,
    public readonly actorKeycloakSub: string,
    public readonly liked: boolean
  ) {}
}
