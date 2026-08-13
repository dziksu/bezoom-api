export class DeleteEventCommentCommand {
  constructor(
    public readonly eventId: string,
    public readonly commentId: string,
    public readonly authorKeycloakSub: string
  ) {}
}
