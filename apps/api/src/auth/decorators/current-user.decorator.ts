import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '@lms/shared';

export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext): JwtPayload | unknown => {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as JwtPayload;
    return data ? user?.[data] : user;
  },
);
