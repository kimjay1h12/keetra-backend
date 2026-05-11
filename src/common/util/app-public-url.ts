import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

const log = new Logger('AppPublicUrl');

/** Env keys tried in order (first non-empty wins). */
export const APP_PUBLIC_URL_ENV_KEYS = [
  'APP_PUBLIC_URL',
  'FRONTEND_PUBLIC_URL',
  'WEB_APP_URL',
  'PUBLIC_SITE_URL',
] as const;

const LOCAL_DEFAULT = 'http://localhost:3000';

/**
 * Reads the configured browser app origin from env, if any (no trailing slash).
 */
export function resolveAppPublicUrlFromEnv(config: ConfigService): string | undefined {
  for (const key of APP_PUBLIC_URL_ENV_KEYS) {
    const raw = config.get<string>(key)?.trim();
    if (raw) {
      return raw.replace(/\/+$/, '');
    }
  }
  return undefined;
}

/**
 * Browser-facing origin for links in emails and API payloads (no trailing slash).
 * In production, set `APP_PUBLIC_URL` (or an alias) to your deployed frontend, e.g. `https://app.example.com`.
 */
export function getAppPublicBaseUrl(config: ConfigService): string {
  const fromEnv = resolveAppPublicUrlFromEnv(config);
  if (fromEnv) {
    return fromEnv;
  }
  if (process.env.NODE_ENV === 'production') {
    log.warn(
      `Invite and share links use ${LOCAL_DEFAULT} because none of ${APP_PUBLIC_URL_ENV_KEYS.join(', ')} is set. ` +
        'Set APP_PUBLIC_URL to your live web app origin (https://…), not the API host.',
    );
  }
  return LOCAL_DEFAULT;
}
