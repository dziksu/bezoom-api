import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { UserBlockRepository } from '../../../domain/user-block.repository';
import type { CursorBlockedProfilesDto } from '../../dto/safety.dto';
import { ListBlockedUsersQuery } from './list-blocked-users.query';

@QueryHandler(ListBlockedUsersQuery)
export class ListBlockedUsersHandler implements IQueryHandler<ListBlockedUsersQuery, CursorBlockedProfilesDto> {
  constructor(private readonly blocks: UserBlockRepository) {}

  async execute(query: ListBlockedUsersQuery): Promise<CursorBlockedProfilesDto> {
    const page = await this.blocks.list(query.blockerKeycloakSub, query.cursor, query.limit);
    return {
      items: page.items.map((item) => ({
        id: item.profileId,
        username: item.username ?? undefined,
        firstName: item.firstName ?? undefined,
        lastName: item.lastName ?? undefined,
        avatarUrl: item.avatarUrl ?? undefined,
        blockedAt: item.blockedAt
      })),
      hasMore: page.hasMore,
      nextCursor: page.nextCursor
    };
  }
}
