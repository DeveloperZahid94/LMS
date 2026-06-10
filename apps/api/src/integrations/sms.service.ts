import { Injectable, Logger } from '@nestjs/common';

export const SMS_SERVICE = Symbol('SMS_SERVICE');

export interface SmsMessage {
  to: string;
  body: string;
  /** MSG91 auth key (per-tenant, from Settings → SMS). */
  apiKey?: string;
  /** MSG91 sender / DLT header id (6 chars), per-tenant. */
  senderId?: string;
}

export interface SmsSendResult {
  id: string;
  status: 'queued' | 'sent' | 'failed';
  error?: string;
}

export interface SmsService {
  send(msg: SmsMessage): Promise<SmsSendResult>;
}

/**
 * Real MSG91 SMS sender. Uses the tenant's auth key + sender id (passed in by
 * the caller from Settings → SMS). Falls back to a clear 'failed' result when
 * not configured — never throws, so a bulk send keeps going.
 *
 * Transactional route (4) via MSG91's HTTP API. Note: Indian SMS requires the
 * message to match a DLT-approved template registered against the sender id;
 * MSG91 enforces that operator-side.
 */
@Injectable()
export class Msg91SmsService implements SmsService {
  private readonly logger = new Logger('Msg91Sms');

  async send(msg: SmsMessage): Promise<SmsSendResult> {
    const authkey = (msg.apiKey ?? '').trim();
    const sender = (msg.senderId ?? '').trim();
    if (!authkey || !sender) {
      return { id: '', status: 'failed', error: 'SMS not configured — set the MSG91 API key & sender ID in Settings → SMS.' };
    }
    const mobile = this.normalize(msg.to);
    if (!mobile) return { id: '', status: 'failed', error: 'Invalid phone number' };

    const params = new URLSearchParams({
      authkey,
      mobiles: mobile,
      message: msg.body,
      sender,
      route: '4',     // transactional
      country: '91',
    });
    const url = `https://api.msg91.com/api/sendhttp.php?${params.toString()}`;

    try {
      const res = await fetch(url, { method: 'GET' });
      const text = (await res.text()).trim();
      // Success → MSG91 returns a request id (hex). Errors come back as a string
      // or JSON containing "error"/"invalid"/"failure".
      if (res.ok && text && !/error|invalid|failure|"type"\s*:\s*"error"/i.test(text)) {
        return { id: text, status: 'queued' };
      }
      this.logger.warn(`MSG91 send failed → ${mobile}: ${text}`);
      return { id: '', status: 'failed', error: this.cleanError(text) || `HTTP ${res.status}` };
    } catch (e: any) {
      const m = e?.message ?? 'Network error';
      this.logger.warn(`MSG91 send error → ${mobile}: ${m}`);
      return { id: '', status: 'failed', error: m };
    }
  }

  /** Normalise to MSG91's expected 91XXXXXXXXXX form. */
  private normalize(phone: string): string | null {
    const digits = (phone ?? '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 10) return '91' + digits;
    if (digits.length === 12 && digits.startsWith('91')) return digits;
    if (digits.length === 11 && digits.startsWith('0')) return '91' + digits.slice(1);
    return digits;
  }

  private cleanError(raw: string): string {
    if (!raw) return '';
    try {
      const j = JSON.parse(raw);
      return j.message || j.error || raw;
    } catch {
      return raw.slice(0, 140);
    }
  }
}

/** Logs instead of sending — used until MSG91 credentials are configured. */
@Injectable()
export class SmsStubService implements SmsService {
  private readonly logger = new Logger('SmsStub');
  async send(msg: SmsMessage): Promise<SmsSendResult> {
    this.logger.log(`[STUB] SMS → ${msg.to}: ${msg.body.slice(0, 80)}`);
    return { id: `sms_stub_${Date.now()}`, status: 'queued' };
  }
}
