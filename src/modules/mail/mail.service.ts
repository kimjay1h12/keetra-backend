import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand, SendRawEmailCommand } from '@aws-sdk/client-ses';
import * as nodemailer from 'nodemailer';

type MailMode = 'none' | 'smtp' | 'ses';

/** Binary attachment for MIME / SMTP / SES raw sends. */
export type MailAttachmentPayload = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

function emailEnabledFlag(config: ConfigService): boolean {
  const flag = config.get<string>('EMAIL_ENABLED', 'false');
  return flag === 'true' || flag === '1';
}

function resolveAwsAccessKey(config: ConfigService): string | undefined {
  return (
    config.get<string>('AWS_ACCESS_KEY_ID')?.trim() ||
    config.get<string>('AWS_ACCESS_KEY')?.trim() ||
    undefined
  );
}

function resolveAwsSecretKey(config: ConfigService): string | undefined {
  return (
    config.get<string>('AWS_SECRET_ACCESS_KEY')?.trim() ||
    config.get<string>('AWS_SECRET_KEY')?.trim() ||
    undefined
  );
}

function resolveSesRegion(config: ConfigService): string {
  return (
    config.get<string>('AWS_SES_REGION')?.trim() ||
    config.get<string>('AWS_REGION')?.trim() ||
    'us-east-1'
  );
}

/**
 * Outbound mail:
 *
 * **Amazon SES** (when `EMAIL_ENABLED=true` and IAM keys + region + from are set):
 * - `AWS_ACCESS_KEY_ID` or `AWS_ACCESS_KEY`
 * - `AWS_SECRET_ACCESS_KEY` or `AWS_SECRET_KEY`
 * - `AWS_REGION` or `AWS_SES_REGION` (defaults to `us-east-1`)
 * - From: `SMTP_FROM` or `AWS_SUPPORT` (verified identity in SES)
 *
 * **SMTP** (when `EMAIL_ENABLED=true` and `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` are set):
 * - Works with Gmail App Passwords, etc.
 *
 * **Links in emails** (invites, meetings): `APP_PUBLIC_URL` (aliases in `app-public-url.ts`).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly ses: SESClient | null;
  private readonly mode: MailMode;
  private readonly from: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const wantEmail = emailEnabledFlag(this.config);
    const accessKey = resolveAwsAccessKey(this.config);
    const secretKey = resolveAwsSecretKey(this.config);
    const region = resolveSesRegion(this.config);
    const support = this.config.get<string>('AWS_SUPPORT')?.trim();
    const smtpFrom = this.config.get<string>('SMTP_FROM')?.trim();
    this.from =
      smtpFrom ||
      (support ? `KeeTra <${support}>` : 'KeeTra <noreply@localhost>');

    const host = this.config.get<string>('SMTP_HOST');
    const portStr = this.config.get<string>('SMTP_PORT', '587');
    const port = Number(portStr) || 587;
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    const sesReady = Boolean(accessKey && secretKey && region && (smtpFrom || support));

    if (wantEmail && sesReady && accessKey && secretKey) {
      this.ses = new SESClient({
        region,
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      });
      this.transporter = null;
      this.mode = 'ses';
      this.enabled = true;
      this.logger.log(`Email: Amazon SES (${region}), from ${this.from}`);
    } else if (wantEmail && host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      this.ses = null;
      this.mode = 'smtp';
      this.enabled = true;
      this.logger.log(`Email: SMTP (${host}:${port})`);
    } else {
      this.transporter = null;
      this.ses = null;
      this.mode = 'none';
      this.enabled = false;
      if (wantEmail) {
        this.logger.warn(
          'EMAIL_ENABLED is set but neither SES (AWS_ACCESS_KEY* + AWS_SECRET_* + AWS_SUPPORT or SMTP_FROM + region) nor SMTP_HOST/SMTP_USER/SMTP_PASS is complete; emails are skipped.',
        );
      }
    }
  }

  /** Whether outbound email (SES/SMTP) is configured and active. */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Builds a full RFC822 message (per recipient) for SES SendRawEmail. */
  private async buildMimeBuffer(
    to: string,
    subject: string,
    text: string,
    html: string,
    attachments?: MailAttachmentPayload[],
  ): Promise<Buffer> {
    const transport = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: 'unix',
    });
    const info = await transport.sendMail({
      from: this.from,
      to,
      subject,
      text,
      html,
      attachments: attachments?.length
        ? attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
            contentType: a.contentType,
          }))
        : undefined,
    });
    return info.message as Buffer;
  }

  /** Sends the same notification to each address (no cross-recipient visibility). */
  async sendToEach(
    recipients: string[],
    params: { subject: string; text: string; html: string; attachments?: MailAttachmentPayload[] },
  ): Promise<void> {
    const to = [...new Set(recipients.map((e) => e.trim().toLowerCase()).filter(Boolean))];
    if (!to.length) return;
    if (!this.enabled) {
      this.logger.debug(`Email skipped (${params.subject}, ${to.length} recipients)`);
      return;
    }

    const attachments = params.attachments?.length ? params.attachments : undefined;

    if (this.mode === 'ses' && this.ses) {
      if (attachments?.length) {
        await Promise.allSettled(
          to.map(async (addr) => {
            try {
              const raw = await this.buildMimeBuffer(addr, params.subject, params.text, params.html, attachments);
              await this.ses!.send(
                new SendRawEmailCommand({
                  Source: this.from,
                  RawMessage: { Data: raw },
                }),
              );
            } catch (err) {
              this.logger.error(`SES raw send failed for ${addr}: ${params.subject}`, err);
            }
          }),
        );
        return;
      }

      await Promise.allSettled(
        to.map(async (addr) => {
          try {
            await this.ses!.send(
              new SendEmailCommand({
                Source: this.from,
                Destination: { ToAddresses: [addr] },
                Message: {
                  Subject: { Data: params.subject, Charset: 'UTF-8' },
                  Body: {
                    Text: { Data: params.text, Charset: 'UTF-8' },
                    Html: { Data: params.html, Charset: 'UTF-8' },
                  },
                },
              }),
            );
          } catch (err) {
            this.logger.error(`SES send failed for ${addr}: ${params.subject}`, err);
          }
        }),
      );
      return;
    }

    if (this.mode === 'smtp' && this.transporter) {
      await Promise.allSettled(
        to.map(async (addr) => {
          try {
            await this.transporter!.sendMail({
              from: this.from,
              to: addr,
              subject: params.subject,
              text: params.text,
              html: params.html,
              attachments: attachments?.map((a) => ({
                filename: a.filename,
                content: a.content,
                contentType: a.contentType,
              })),
            });
          } catch (err) {
            this.logger.error(`sendMail failed for ${addr}: ${params.subject}`, err);
          }
        }),
      );
    }
  }
}
