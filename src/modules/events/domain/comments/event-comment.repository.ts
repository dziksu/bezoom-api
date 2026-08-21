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
  authorRole?: 'ORGANIZER' | 'SUBMITTER';
  mentions: PublicEventActor[];
  likesCount: number;
  likedByViewer: boolean;
  organizerLike?: PublicEventActor;
  createdAt: Date;
  updatedAt: Date;
  editedAt?: Date;
}

export interface EventCommentEngagementTarget {
  authorKeycloakSub: string;
}

export interface EventCommentLikeRecord {
  liked: boolean;
  likesCount: number;
  organizerLike?: PublicEventActor;
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
  abstract findEngagementTarget(eventId: string, commentId: string): Promise<EventCommentEngagementTarget | null>;
  abstract setLike(
    eventId: string,
    commentId: string,
    actorKeycloakSub: string,
    liked: boolean
  ): Promise<EventCommentLikeRecord | null>;
}
