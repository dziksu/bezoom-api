import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ICurrentUser } from '@api/shared/domain/auth';

export const CurrentUser = createParamDecorator(
  (
    property: keyof ICurrentUser | undefined,
    context: ExecutionContext
  ): ICurrentUser[keyof ICurrentUser] | ICurrentUser => {
    const request = context.switchToHttp().getRequest<{ currentUser: ICurrentUser }>();
    const user = request.currentUser;
    return property ? user[property] : user;
  }
);
