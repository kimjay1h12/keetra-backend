import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../interfaces/auth-user.interface';

/** Use on routes that require a full KeeTra account (not a meeting guest JWT). */
@Injectable()
export class RejectMeetingGuestGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (user?.isGuest) {
      throw new ForbiddenException('This action requires a signed-in KeeTra account');
    }
    return true;
  }
}
