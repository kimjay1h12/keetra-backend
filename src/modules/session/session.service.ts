import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { createHash } from 'crypto';

@Injectable()
export class SessionService implements OnModuleDestroy {
  private readonly logger = new Logger(SessionService.name);
  private readonly redisUrl?: string;
  private readonly fallbackStore = new Map<string, string>();
  private redisClient?: Redis;

  constructor(private readonly configService: ConfigService) {
    this.redisUrl = this.configService.get<string>('REDIS_URL');
    if (this.redisUrl) {
      this.redisClient = new Redis(this.redisUrl, { maxRetriesPerRequest: 1 });
      this.redisClient.on('error', () => {
        this.logger.warn('Redis unavailable, using in-memory sessions.');
      });
    }
  }

  async onModuleDestroy() {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }

  hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  async saveRefreshSession(userId: string, tokenHash: string, ttlSeconds: number) {
    const key = `refresh:${userId}:${tokenHash}`;
    if (this.redisClient?.status === 'ready') {
      await this.redisClient.set(key, '1', 'EX', ttlSeconds);
      return;
    }
    this.fallbackStore.set(key, '1');
  }

  async hasRefreshSession(userId: string, tokenHash: string) {
    const key = `refresh:${userId}:${tokenHash}`;
    if (this.redisClient?.status === 'ready') {
      return Boolean(await this.redisClient.get(key));
    }
    return this.fallbackStore.has(key);
  }

  async revokeRefreshSession(userId: string, tokenHash: string) {
    const key = `refresh:${userId}:${tokenHash}`;
    if (this.redisClient?.status === 'ready') {
      await this.redisClient.del(key);
      return;
    }
    this.fallbackStore.delete(key);
  }
}
