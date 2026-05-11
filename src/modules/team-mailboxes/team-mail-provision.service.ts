import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ProvisionMailboxCreatePayload = {
  action: 'mailbox.create';
  email: string;
  password: string;
  displayName?: string;
  quotaMb: number;
};

export type ProvisionMailboxDeletePayload = {
  action: 'mailbox.delete';
  email: string;
};

export type ProvisionMailboxPasswordPayload = {
  action: 'mailbox.password';
  email: string;
  password: string;
};

export type ProvisionPayload =
  | ProvisionMailboxCreatePayload
  | ProvisionMailboxDeletePayload
  | ProvisionMailboxPasswordPayload;

/**
 * Optional HTTP bridge to your self-hosted mail stack (Postfix/Dovecot, Mailu, etc.).
 * Set TEAM_MAIL_PROVISION_URL and TEAM_MAIL_PROVISION_SECRET to POST JSON payloads.
 */
@Injectable()
export class TeamMailProvisionService {
  private readonly logger = new Logger(TeamMailProvisionService.name);

  constructor(private readonly config: ConfigService) {}

  private url(): string | undefined {
    const u = this.config.get<string>('TEAM_MAIL_PROVISION_URL')?.trim();
    return u || undefined;
  }

  private secret(): string | undefined {
    const s = this.config.get<string>('TEAM_MAIL_PROVISION_SECRET')?.trim();
    return s || undefined;
  }

  async send(payload: ProvisionPayload): Promise<void> {
    const url = this.url();
    if (!url) {
      this.logger.debug(`Team mail provision skipped (no TEAM_MAIL_PROVISION_URL): ${payload.action}`);
      return;
    }
    const secret = this.secret();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (secret) {
      headers['X-Team-Mail-Secret'] = secret;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.warn(
          `Provision webhook HTTP ${res.status} for ${payload.action}: ${body.slice(0, 500)}`,
        );
        throw new Error(`Provision webhook failed: HTTP ${res.status}`);
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        this.logger.warn(`Provision webhook timeout: ${payload.action}`);
        throw new Error('Provision webhook timed out');
      }
      throw e;
    } finally {
      clearTimeout(t);
    }
  }
}
