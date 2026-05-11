import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthUser } from '../../../common/interfaces/auth-user.interface';

interface JwtPayload {
  sub: string;
  email?: string;
  typ?: string;
  /** Canonical meeting Mongo id for guest tokens */
  mid?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'dev-secret'),
    });
  }

  validate(payload: JwtPayload): AuthUser {
    if (payload.typ === 'mtg_guest') {
      const mid = typeof payload.mid === 'string' ? payload.mid.trim() : '';
      if (!mid || !/^[a-f0-9]{24}$/i.test(mid)) {
        throw new UnauthorizedException('Invalid guest token');
      }
      return {
        id: payload.sub,
        email: payload.email ?? 'guest@meeting.invalid',
        isGuest: true,
        guestMeetingId: mid,
      };
    }
    if (!payload.email) {
      throw new UnauthorizedException('Invalid token');
    }
    return { id: payload.sub, email: payload.email, isGuest: false };
  }
}
