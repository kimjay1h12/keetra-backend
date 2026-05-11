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
      // Twilio and many providers use `turn:` or TLS `turns:` — both provide relay candidates.
      if (typeof u === 'string' && /^turns?:/i.test(u.trim())) return true;
    }
  }
  return false;
}

@Injectable()
export class RtcService {
  private readonly logger = new Logger(RtcService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * ICE servers for WebRTC. Priority:
   * 1. Twilio Network Traversal (`tokens.create`) — recommended for production TURN/STUN.
   * 2. `RTC_ICE_SERVERS_JSON` — static TURN/STUN from any provider.
   * 3. Public STUN + OpenRelay TURN — dev/fallback only; do not rely on this for production SLA.
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
          return {
            iceServers: mapped,
            relayAvailable,
          };
        }
        this.logger.warn('Twilio returned no ICE servers; falling back');
      } catch (err) {
        this.logger.warn(
          `Twilio Network Traversal token failed: ${(err as Error).message}`,
        );
      }
    }

    const staticJson = this.config.get<string>('RTC_ICE_SERVERS_JSON')?.trim();
    if (staticJson) {
      try {
        const parsed = JSON.parse(staticJson) as unknown;
        if (Array.isArray(parsed) && parsed.length) {
          const list = parsed as IceServerDto[];
          return {
            iceServers: list,
            relayAvailable: serversIncludeRelay(list),
          };
        }
      } catch {
        this.logger.warn('RTC_ICE_SERVERS_JSON is not valid JSON');
      }
    }

    // Free TURN servers from open-relay project + Google STUN as fallback
    // These provide basic relay capability for cross-network calls
    const fallbacks: IceServerDto[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      // OpenRelay TURN servers (free, community-maintained)
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

    this.logger.warn(
      'Using free OpenRelay TURN servers as fallback. For production, configure Twilio or RTC_ICE_SERVERS_JSON.',
    );

    return {
      iceServers: fallbacks,
      relayAvailable: true,
    };
  }
}
