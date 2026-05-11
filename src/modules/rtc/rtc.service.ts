import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';

type IceServerDto = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

function normalizeTwilioServers(
  servers: Array<{
    urls?: string;
    url?: string;
    username?: string;
    credential?: string;
  }>,
): IceServerDto[] {
  const out: IceServerDto[] = [];
  for (const s of servers) {
    const urls = s.urls ?? s.url;
    if (!urls) continue;
    const row: IceServerDto = { urls };
    if (s.username) row.username = s.username;
    if (s.credential) row.credential = s.credential;
    out.push(row);
  }
  return out;
}

function serversIncludeRelay(servers: IceServerDto[]): boolean {
  for (const s of servers) {
    const urls = s.urls;
    const arr = Array.isArray(urls) ? urls : urls ? [urls] : [];
    for (const u of arr) {
      if (typeof u === 'string' && /^turns?:/i.test(u.trim())) return true;
    }
  }
  return false;
}

/** Public STUN + Metered OpenRelay TURN — appended when primary ICE has no relay (cross-NAT needs TURN). */
function openRelayAndStunFallback(): IceServerDto[] {
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turns:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ];
}

@Injectable()
export class RtcService {
  private readonly logger = new Logger(RtcService.name);

  constructor(private readonly config: ConfigService) {}

  private ensureRelayPaths(servers: IceServerDto[], relayFlag: boolean): {
    iceServers: IceServerDto[];
    relayAvailable: boolean;
  } {
    const hasRelay = relayFlag && serversIncludeRelay(servers);
    if (hasRelay) {
      return { iceServers: servers, relayAvailable: true };
    }
    const extra = openRelayAndStunFallback();
    this.logger.log(
      `Appending OpenRelay/STUN fallback (${extra.length} entries) — primary set had no usable TURN relay.`,
    );
    return {
      iceServers: [...servers, ...extra],
      relayAvailable: true,
    };
  }

  /**
   * Optional Metered.ca dynamic credentials (no Twilio required).
   * Set METERED_TURN_HOST=yourapp.metered.live and METERED_TURN_SECRET_KEY from the Metered dashboard.
   */
  private async tryMeteredTurnCredentials(): Promise<{
    iceServers: IceServerDto[];
    relayAvailable: boolean;
  } | null> {
    const fullUrl = this.config.get<string>('METERED_TURN_CREDENTIAL_URL')?.trim();
    const host = this.config.get<string>('METERED_TURN_HOST')?.trim();
    const secret = this.config.get<string>('METERED_TURN_SECRET_KEY')?.trim();
    const url =
      fullUrl ||
      (host && secret
        ? `https://${host.replace(/^https?:\/\//i, '')}/api/v1/turn/credential?secretKey=${encodeURIComponent(secret)}`
        : null);
    if (!url) return null;

    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 10_000);
      let res: Response;
      try {
        res = await fetch(url, { signal: ac.signal });
      } finally {
        clearTimeout(t);
      }
      if (!res.ok) {
        this.logger.warn(`Metered TURN credential HTTP ${res.status}`);
        return null;
      }
      const body = (await res.json()) as { iceServers?: unknown };
      const raw = body.iceServers;
      if (!Array.isArray(raw) || raw.length === 0) return null;
      const list = raw as IceServerDto[];
      const relayAvailable = serversIncludeRelay(list);
      this.logger.log(
        `ICE config: Metered credential API (${list.length} server(s), relay=${relayAvailable})`,
      );
      return this.ensureRelayPaths(list, relayAvailable);
    } catch (err) {
      this.logger.warn(`Metered TURN credential failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * ICE servers for WebRTC. Priority:
   * 1. Twilio Network Traversal
   * 2. Metered.ca credential URL (METERED_TURN_CREDENTIAL_URL or METERED_TURN_HOST + METERED_TURN_SECRET_KEY)
   * 3. RTC_ICE_SERVERS_JSON
   * 4. Public STUN + OpenRelay TURN (always includes TURN for basic cross-network)
   */
  async getIceServersForClient(): Promise<{
    iceServers: IceServerDto[];
    relayAvailable: boolean;
  }> {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID')?.trim();
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN')?.trim();
    const ttlRaw = this.config.get<string>('TWILIO_ICE_TTL_SECONDS');
    const ttl = ttlRaw ? Number.parseInt(ttlRaw, 10) : 86_400;
    const safeTtl =
      Number.isFinite(ttl) && ttl >= 600 && ttl <= 86_400 ? ttl : 86_400;

    if (accountSid && authToken) {
      try {
        const client = twilio(accountSid, authToken);
        const token = await client.tokens.create({ ttl: safeTtl });
        const mapped = normalizeTwilioServers(token.iceServers ?? []);
        if (mapped.length) {
          const relayAvailable = serversIncludeRelay(mapped);
          this.logger.log(
            `ICE config: Twilio Network Traversal (${mapped.length} server(s), relay=${relayAvailable})`,
          );
          return this.ensureRelayPaths(mapped, relayAvailable);
        }
        this.logger.warn('Twilio returned no ICE servers; falling back');
      } catch (err) {
        this.logger.warn(
          `Twilio Network Traversal token failed: ${(err as Error).message}`,
        );
      }
    }

    const metered = await this.tryMeteredTurnCredentials();
    if (metered?.iceServers.length) {
      return metered;
    }

    const staticJson = this.config.get<string>('RTC_ICE_SERVERS_JSON')?.trim();
    if (staticJson) {
      try {
        const parsed = JSON.parse(staticJson) as unknown;
        if (Array.isArray(parsed) && parsed.length) {
          const list = parsed as IceServerDto[];
          const relayAvailable = serversIncludeRelay(list);
          return this.ensureRelayPaths(list, relayAvailable);
        }
      } catch {
        this.logger.warn('RTC_ICE_SERVERS_JSON is not valid JSON');
      }
    }

    const fallbacks = openRelayAndStunFallback();
    this.logger.warn(
      'Using built-in STUN + OpenRelay TURN. For production SLA configure Twilio, Metered (METERED_TURN_*), or RTC_ICE_SERVERS_JSON.',
    );

    return {
      iceServers: fallbacks,
      relayAvailable: true,
    };
  }
}
