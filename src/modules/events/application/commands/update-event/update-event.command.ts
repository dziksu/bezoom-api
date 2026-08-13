import type { UpdateEventDto } from '../../dto/update-event.dto';

export class UpdateEventCommand {
  constructor(
    public readonly eventId: string,
    public readonly organizerKeycloakSub: string,
    public readonly changes: UpdateEventDto
  ) {}
}
