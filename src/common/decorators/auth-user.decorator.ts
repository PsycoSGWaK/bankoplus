import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

interface RequestWithAuthUser extends Request {
  user?: { userId: string };
}

// À utiliser sur les routes protégées par JwtAuthGuard (stratégie Passport),
// qui pose req.user — distinct de CurrentUserId, utilisé après StepTokenGuard.
export const AuthUser = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<RequestWithAuthUser>();
  return request.user?.userId as string;
});
