import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SignalingGateway } from './signaling.gateway';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [JwtModule.register({}), forwardRef(() => ChatModule)],
  providers: [SignalingGateway],
  exports: [SignalingGateway],
})
export class SignalingModule {}
