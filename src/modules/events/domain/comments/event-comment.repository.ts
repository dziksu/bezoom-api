export interface PublicEventActor {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
}

export interface EventCommentRecord {
  id: string;
  eventId: string;
  parentId?: string;
  body: string;
  author: PublicEventActor;
  createdAt: Date;
  updatedAt: Date;
  editedAt?: Date;
}

export abstract class EventCommentRepository {
  abstract create(
    eventId: string,
    authorKeycloakSub: string,
    body: string,
    parentId?: string
  ): Promise<EventCommentRecord>;
  abstract updateOwned(
    eventId: string,
    commentId: string,
    authorKeycloakSub: string,
    body: string
  ): Promise<EventCommentRecord | null>;
  abstract deleteOwned(eventId: string, commentId: string, authorKeycloakSub: string): Promise<boolean>;
}
