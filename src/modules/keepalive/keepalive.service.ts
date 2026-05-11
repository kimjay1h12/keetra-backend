import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

/**
 * Periodically hits the service over its public URL so hosts like Render see inbound HTTP
 * and are less likely to spin the web service down (free/hobby idle behavior).
 *
 * Set `KEEPALIVE_ENABLED=false` to disable. When unset, runs on Render (`RENDER=true`) if a URL can be resolved.
 */
@Injectable()
export class KeepaliveService implements OnModuleInit {
  private readonly logger = new Logger(KeepaliveService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.resolvePingUrl();
    if (!this.isEnabled() || !url) return;
    this.logger.log(`Render keepalive: GET ${url} every 10 minutes`);
  }

  private isEnabled(): boolean {
    const explicit = this.config.get<string>('KEEPALIVE_ENABLED')?.trim().toLowerCase();
    if (explicit === 'false' || explicit === '0' || explicit === 'no') return false;
    if (explicit === 'true' || explicit === '1' || explicit === 'yes') return true;
    return this.config.get<string>('RENDER') === 'true';
  }

  private resolvePingUrl(): string | null {
    const custom = this.config.get<string>('KEEPALIVE_URL')?.trim();
    if (custom) return custom;

    const base = this.config.get<string>('RENDER_EXTERNAL_URL')?.trim();
    if (!base) return null;
    const root = base.replace(/\/+$/, '');
    return `${root}/api`;
  }

  @Cron('0 */10 * * * *')
  async pingPublicUrl(): Promise<void> {
    if (!this.isEnabled()) return;
    const url = this.resolvePingUrl();
    if (!url) return;

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 25_000);
    try {
      const res = await fetch(url, { method: 'GET', signal: ac.signal });
      if (!res.ok) {
        this.logger.warn(`Keepalive non-OK ${res.status} for ${url}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Keepalive request failed: ${msg}`);
    } finally {
      clearTimeout(t);
    }
  }
}
