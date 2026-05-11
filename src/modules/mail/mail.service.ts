import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * SMTP delivery (works with Gmail):
 * - EMAIL_ENABLED=true
 * - SMTP_HOST=smtp.gmail.com
 * - SMTP_PORT=587
 * - SMTP_USER=your.address@gmail.com
 * - SMTP_PASS=<Google App Password> (not your normal Gmail password)
 * - SMTP_FROM="KeeTra <your.address@gmail.com>"
 * - APP_PUBLIC_URL=https://your-frontend (used in invite links)
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly from: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const flag = this.config.get<string>('EMAIL_ENABLED', 'false');
    const enabled = flag === 'true' || flag === '1';
    const host = this.config.get<string>('SMTP_HOST');
    const portStr = this.config.get<string>('SMTP_PORT', '587');
    const port = Number(portStr) || 587;
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    this.from = this.config.get<string>('SMTP_FROM', 'KeeTra <noreply@localhost>');

    if (enabled && host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      this.enabled = true;
    } else {
      this.transporter = null;
      this.enabled = false;
      if (enabled) {
        this.logger.warn('EMAIL_ENABLED is set but SMTP_HOST/SMTP_USER/SMTP_PASS are incomplete; emails are skipped.');
      }
    }
  }

  /** Sends the same notification to each address (no cross-recipient visibility). */
  async sendToEach(recipients: string[], params: { subject: string; text: string; html: string }): Promise<void> {
    const to = [...new Set(recipients.map((e) => e.trim().toLowerCase()).filter(Boolean))];
    if (!to.length) return;
    if (!this.enabled || !this.transporter) {
      this.logger.debug(`Email skipped (${params.subject}, ${to.length} recipients)`);
      return;
    }
    await Promise.allSettled(
      to.map(async (addr) => {
        try {
          await this.transporter!.sendMail({
            from: this.from,
            to: addr,
            subject: params.subject,
            text: params.text,
            html: params.html,
          });
        } catch (err) {
          this.logger.error(`sendMail failed for ${addr}: ${params.subject}`, err);
        }
      }),
    );
  }
}
