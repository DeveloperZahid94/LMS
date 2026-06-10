import { Global, Module } from '@nestjs/common';
import { RAZORPAY_SERVICE, RazorpayStubService } from './razorpay.service';
import { WHATSAPP_SERVICE, WhatsAppStubService } from './whatsapp.service';
import { SMS_SERVICE, Msg91SmsService } from './sms.service';

/**
 * Stubbed paid integrations.
 * Replace `useClass` with a real implementation when API keys are available;
 * the rest of the app depends only on the abstract interface tokens.
 */
@Global()
@Module({
  providers: [
    { provide: RAZORPAY_SERVICE, useClass: RazorpayStubService },
    { provide: WHATSAPP_SERVICE, useClass: WhatsAppStubService },
    { provide: SMS_SERVICE, useClass: Msg91SmsService },
  ],
  exports: [RAZORPAY_SERVICE, WHATSAPP_SERVICE, SMS_SERVICE],
})
export class IntegrationsModule {}
