import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server } from 'socket.io';
import { ChatService } from '../chat/chat.service';

@Injectable()
@WebSocketGateway({
  namespace: process.env.SOCKET_NAMESPACE ?? '/signal',
  cors: {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'ngrok-skip-browser-warning',
    ],
  },
})
export class SignalingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly chatService: ChatService,
  ) {}

  async handleConnection(client: any) {
    try {
      const token =
        client.handshake?.auth?.token ??
        client.handshake?.query?.token ??
        client.handshake?.headers?.authorization?.replace?.(/^Bearer\s+/i, '');
      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET', 'dev-secret'),
      }) as { sub?: string; typ?: string; mid?: string };
      if (!payload?.sub) {
        client.disconnect(true);
        return;
      }

      client.data.userId = payload.sub;
      if (payload.typ === 'mtg_guest' && typeof payload.mid === 'string') {
        client.data.guestMeetingId = payload.mid;
      }
      client.join(`user:${payload.sub}`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: any) {}

  emitToMeeting(meetingId: string, event: string, payload: Record<string, unknown>) {
    this.server?.to(`meeting:${meetingId}`).emit(event, payload);
  }

  emitToTeam(teamId: string, event: string, payload: Record<string, unknown>) {
    this.server?.to(`team:${teamId}`).emit(event, payload);
  }

  @SubscribeMessage('meeting.subscribe')
  handleMeetingSubscribe(@ConnectedSocket() client: any, @MessageBody() body: { meetingId: string }) {
    if (!body?.meetingId) return;
    if (client.data?.guestMeetingId && client.data.guestMeetingId !== body.meetingId) {
      return;
    }
    client.join(`meeting:${body.meetingId}`);
  }

  @SubscribeMessage('meeting.unsubscribe')
  handleMeetingUnsubscribe(@ConnectedSocket() client: any, @MessageBody() body: { meetingId: string }) {
    if (!body?.meetingId) return;
    client.leave(`meeting:${body.meetingId}`);
  }

  @SubscribeMessage('team.subscribe')
  handleTeamSubscribe(@ConnectedSocket() client: any, @MessageBody() body: { teamId: string }) {
    if (!body?.teamId) return;
    client.join(`team:${body.teamId}`);
  }

  @SubscribeMessage('team.unsubscribe')
  handleTeamUnsubscribe(@ConnectedSocket() client: any, @MessageBody() body: { teamId: string }) {
    if (!body?.teamId) return;
    client.leave(`team:${body.teamId}`);
  }

  @SubscribeMessage('chat.send')
  async handleChatSend(
    @ConnectedSocket() client: any,
    @MessageBody() body: { meetingId: string; content: string },
  ) {
    if (!body?.meetingId || !body?.content || !client.data?.userId) return;
    if (client.data?.guestMeetingId && client.data.guestMeetingId !== body.meetingId) {
      return;
    }
    const message = await this.chatService.create(body.meetingId, client.data.userId, body.content);
    this.emitToMeeting(body.meetingId, 'chat.message.new', {
      type: 'chat.message.new',
      meetingId: body.meetingId,
      message,
    });
  }

  @SubscribeMessage('call.offer')
  handleOffer(
    @ConnectedSocket() client: any,
    @MessageBody() body: { meetingId: string; offer: unknown; toUserId?: string },
  ) {
    if (!body?.meetingId || !client.data?.userId) return;
    if (client.data?.guestMeetingId && client.data.guestMeetingId !== body.meetingId) {
      return;
    }
    const payload = { ...body, fromUserId: client.data.userId as string };
    if (body.toUserId) {
      this.server?.to(`user:${body.toUserId}`).emit('call.offer', payload);
      return;
    }
    this.emitToMeeting(body.meetingId, 'call.offer', payload);
  }

  @SubscribeMessage('call.answer')
  handleAnswer(
    @ConnectedSocket() client: any,
    @MessageBody() body: { meetingId: string; answer: unknown; toUserId?: string },
  ) {
    if (!body?.meetingId || !client.data?.userId) return;
    if (client.data?.guestMeetingId && client.data.guestMeetingId !== body.meetingId) {
      return;
    }
    const payload = { ...body, fromUserId: client.data.userId as string };
    if (body.toUserId) {
      this.server?.to(`user:${body.toUserId}`).emit('call.answer', payload);
      return;
    }
    this.emitToMeeting(body.meetingId, 'call.answer', payload);
  }

  @SubscribeMessage('call.ice-candidate')
  handleIceCandidate(
    @ConnectedSocket() client: any,
    @MessageBody() body: { meetingId: string; candidate: unknown; toUserId?: string },
  ) {
    if (!body?.meetingId || !client.data?.userId) return;
    if (client.data?.guestMeetingId && client.data.guestMeetingId !== body.meetingId) {
      return;
    }
    const payload = { ...body, fromUserId: client.data.userId as string };
    if (body.toUserId) {
      this.server?.to(`user:${body.toUserId}`).emit('call.ice-candidate', payload);
      return;
    }
    this.emitToMeeting(body.meetingId, 'call.ice-candidate', payload);
  }

  @SubscribeMessage('meeting.reaction')
  handleMeetingReaction(
    @ConnectedSocket() client: any,
    @MessageBody() body: { meetingId: string; emoji: string },
  ) {
    if (!body?.meetingId || !body?.emoji || !client.data?.userId) return;
    if (client.data?.guestMeetingId && client.data.guestMeetingId !== body.meetingId) {
      return;
    }
    const emoji = String(body.emoji).trim().slice(0, 16);
    if (!emoji) return;
    this.emitToMeeting(body.meetingId, 'meeting.reaction', {
      type: 'meeting.reaction',
      meetingId: body.meetingId,
      userId: client.data.userId as string,
      emoji,
    });
  }

  @SubscribeMessage('participant.media.updated')
  handleParticipantMedia(@MessageBody() body: { meetingId: string; participantId: string; media: unknown }) {
    if (!body?.meetingId) return;
    this.emitToMeeting(body.meetingId, 'participant.media.updated', body);
  }

  @SubscribeMessage('participant.screen-share.started')
  handleScreenShareStart(@MessageBody() body: { meetingId: string; participantId: string }) {
    if (!body?.meetingId) return;
    this.emitToMeeting(body.meetingId, 'participant.screen-share.started', body);
  }

  @SubscribeMessage('participant.screen-share.stopped')
  handleScreenShareStop(@MessageBody() body: { meetingId: string; participantId: string }) {
    if (!body?.meetingId) return;
    this.emitToMeeting(body.meetingId, 'participant.screen-share.stopped', body);
  }
}
