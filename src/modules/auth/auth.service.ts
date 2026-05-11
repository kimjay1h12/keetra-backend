import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { SessionService } from '../session/session.service';
import { toPublicUser } from '../../common/user-public';
import { UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly sessionService: SessionService,
  ) {}

  private refreshSessionTtlSeconds(): number {
    const raw = (this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '30d').trim();
    const m = /^(\d+)(d|h|m|s)$/i.exec(raw);
    if (!m) return 60 * 60 * 24 * 30;
    const n = parseInt(m[1], 10);
    if (!Number.isFinite(n) || n < 1) return 60 * 60 * 24 * 30;
    const u = m[2].toLowerCase();
    if (u === 'd') return n * 86400;
    if (u === 'h') return n * 3600;
    if (u === 'm') return n * 60;
    return n;
  }

  private async signTokenPair(user: UserDocument) {
    const payload = { sub: user.id, email: user.email };
    const accessExpiresIn = this.configService.get<string>('JWT_EXPIRES_IN') ?? '1h';
    const refreshExpiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '30d';
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_SECRET', 'dev-secret'),
      expiresIn: accessExpiresIn as any,
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
      expiresIn: refreshExpiresIn as any,
    });
    const refreshTokenHash = this.sessionService.hashToken(refreshToken);
    const refreshTtlSeconds = this.refreshSessionTtlSeconds();
    await this.sessionService.saveRefreshSession(user.id, refreshTokenHash, refreshTtlSeconds);
    return { accessToken, refreshToken };
  }

  private safeUser(user: UserDocument) {
    return toPublicUser(user);
  }

  async register(email: string, password: string) {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.usersService.create(email, passwordHash);
    const tokens = await this.signTokenPair(user);
    return { ...tokens, user: this.safeUser(user) };
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const tokens = await this.signTokenPair(user);
    return { ...tokens, user: this.safeUser(user) };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string; email: string }>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
      });
      const tokenHash = this.sessionService.hashToken(refreshToken);
      const exists = await this.sessionService.hasRefreshSession(payload.sub, tokenHash);
      if (!exists) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      await this.sessionService.revokeRefreshSession(payload.sub, tokenHash);
      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      const tokens = await this.signTokenPair(user);
      return { ...tokens, user: this.safeUser(user) };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string, refreshToken: string) {
    const tokenHash = this.sessionService.hashToken(refreshToken);
    await this.sessionService.revokeRefreshSession(userId, tokenHash);
    return { loggedOut: true };
  }

  async me(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Invalid user');
    }
    return this.safeUser(user);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Invalid user');
    }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (currentPassword === newPassword) {
      throw new BadRequestException('New password must be different from the current password');
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await this.usersService.updatePasswordHash(userId, hash);
    return { changed: true };
  }
}
