export class RequestPhotoUploadsCommand {
  constructor(
    public readonly ownerKeycloakSub: string,
    public readonly files: Array<{ mimeType: string }>
  ) {}
}
