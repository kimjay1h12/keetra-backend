import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { MeetingsService } from '../../modules/meetings/meetings.service';
import type { AuthUser } from '../interfaces/auth-user.interface';

/**
 * Ensures JWT guests can only access routes for the meeting encoded in their token.
 */
@Injectable()
export class GuestMeetingScopeGuard implements CanActivate {
  constructor(private readonly meetingsService: MeetingsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ user?: AuthUser; params?: { meetingId?: string } }>();
    const user = req.user;
    if (!user?.isGuest || !user.guestMeetingId) {
      return true;
    }
    const raw = req.params?.meetingId;
    if (!raw) {
      return true;
    }
    const resolved = await this.meetingsService.resolveToMongoId(raw);
    if (resolved !== user.guestMeetingId) {
      throw new ForbiddenException('Guest token is not valid for this meeting');
    }
    return true;
  }
}
