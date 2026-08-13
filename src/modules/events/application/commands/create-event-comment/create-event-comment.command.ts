export class CreateEventCommentCommand {
  constructor(
    public readonly eventId: string,
    public readonly authorKeycloakSub: string,
    public readonly body: string,
    public readonly parentId?: string
  ) {}
}
