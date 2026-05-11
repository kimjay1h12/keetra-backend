import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { RejectMeetingGuestGuard } from '../../common/guards/reject-meeting-guest.guard';

@Module({
  imports: [UsersModule],
  controllers: [ProfileController],
  providers: [ProfileService, RejectMeetingGuestGuard],
  exports: [ProfileService],
})
export class ProfileModule {}
