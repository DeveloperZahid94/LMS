import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailTemplateKey, renderEmailTemplate } from './email.templates';

export interface SendResult {
  ok: boolean;
  skipped?: boolean;
  status?: number;
  error?: string;
  provider?: string;
}

/** A file attachment. `content` is base64-encoded. */
export interface EmailAttachment {
  filename: string;
  content: string;
  contentType?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private prisma: PrismaService) {}

  getConfig(tenantId: string) {
    return this.prisma.emailConfig.findUnique({ where: { tenantId } });
  }

  /** Low-level send using the tenant's configured provider. Never throws. */
  async send(opts: {
    tenantId: string;
    to: string;
    subject: string;
    html: string;
    attachments?: EmailAttachment[];
  }): Promise<SendResult> {
    const cfg = await this.getConfig(opts.tenantId);
    if (!cfg || !cfg.enabled || cfg.provider === 'NONE') {
      return { ok: false, skipped: true, error: 'Email is not enabled for this tenant' };
    }
    if (!opts.to) return { ok: false, error: 'No recipient address' };
    const from = { email: cfg.fromEmail || 'no-reply@lms.local', name: cfg.fromName || 'LMS Platform' };
    try {
      if (cfg.provider === 'BREVO') {
        return await this.sendBrevo(cfg.brevoApiKey ?? '', from, opts.to, opts.subject, opts.html, opts.attachments);
      }
      if (cfg.provider === 'SENDGRID') {
        return await this.sendSendGrid(cfg.sendgridApiKey ?? '', from, opts.to, opts.subject, opts.html, opts.attachments);
      }
      return { ok: false, error: `Unknown provider: ${cfg.provider}` };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.warn(`Email send failed (${cfg.provider}): ${msg}`);
      return { ok: false, error: msg, provider: cfg.provider };
    }
  }

  /** Send one of the ready-made templates. */
  async sendTemplate(opts: { tenantId: string; to: string; template: EmailTemplateKey; data: Record<string, any> }): Promise<SendResult> {
    const { subject, html } = renderEmailTemplate(opts.template, opts.data);
    return this.send({ tenantId: opts.tenantId, to: opts.to, subject, html });
  }

  private async sendBrevo(apiKey: string, from: { email: string; name: string }, to: string, subject: string, html: string, attachments?: EmailAttachment[]): Promise<SendResult> {
    if (!apiKey) return { ok: false, error: 'Brevo API key not set', provider: 'BREVO' };
    const body: Record<string, unknown> = { sender: from, to: [{ email: to }], subject, htmlContent: html };
    if (attachments?.length) body['attachment'] = attachments.map((a) => ({ name: a.filename, content: a.content }));
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true, status: res.status, provider: 'BREVO' };
    const errBody = await res.text();
    return { ok: false, status: res.status, error: errBody.slice(0, 300), provider: 'BREVO' };
  }

  private async sendSendGrid(apiKey: string, from: { email: string; name: string }, to: string, subject: string, html: string, attachments?: EmailAttachment[]): Promise<SendResult> {
    if (!apiKey) return { ok: false, error: 'SendGrid API key not set', provider: 'SENDGRID' };
    const payload: Record<string, unknown> = {
      personalizations: [{ to: [{ email: to }] }],
      from,
      subject,
      content: [{ type: 'text/html', value: html }],
    };
    if (attachments?.length) {
      payload['attachments'] = attachments.map((a) => ({
        content: a.content,
        filename: a.filename,
        type: a.contentType ?? 'application/octet-stream',
        disposition: 'attachment',
      }));
    }
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    // SendGrid returns 202 Accepted with an empty body on success.
    if (res.ok) return { ok: true, status: res.status, provider: 'SENDGRID' };
    const body = await res.text();
    return { ok: false, status: res.status, error: body.slice(0, 300), provider: 'SENDGRID' };
  }
}
