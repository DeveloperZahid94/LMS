import { Injectable, Logger } from '@nestjs/common';

export const WHATSAPP_SERVICE = Symbol('WHATSAPP_SERVICE');

export interface WhatsAppMessage {
  to: string;
  body: string;
  template?: string;
  variables?: Record<string, string>;
}

export interface WhatsAppService {
  send(msg: WhatsAppMessage): Promise<{ id: string; status: 'queued' | 'sent' | 'failed' }>;
}

@Injectable()
export class WhatsAppStubService implements WhatsAppService {
  private readonly logger = new Logger('WhatsAppStub');

  async send(msg: WhatsAppMessage) {
    this.logger.log(`[STUB] WhatsApp → ${msg.to}: ${msg.body.slice(0, 80)}`);
    return { id: `wa_stub_${Date.now()}`, status: 'queued' as const };
  }
}
