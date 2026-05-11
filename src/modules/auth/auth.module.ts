import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { SessionModule } from '../session/session.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RejectMeetingGuestGuard } from '../../common/guards/reject-meeting-guest.guard';

@Module({
  imports: [UsersModule, SessionModule, PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RejectMeetingGuestGuard],
  exports: [AuthService, JwtStrategy, JwtModule, RejectMeetingGuestGuard],
})
export class AuthModule {}
