export class UpdateEventCommentCommand {
  constructor(
    public readonly eventId: string,
    public readonly commentId: string,
    public readonly authorKeycloakSub: string,
    public readonly body: string
  ) {}
}
