import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

export const RAZORPAY_SERVICE = Symbol('RAZORPAY_SERVICE');

export interface RazorpayOrder {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

export interface RazorpayService {
  createOrder(amount: number, currency: string, receipt: string): Promise<RazorpayOrder>;
  verifySignature(orderId: string, paymentId: string, signature: string): boolean;
}

@Injectable()
export class RazorpayStubService implements RazorpayService {
  private readonly logger = new Logger('RazorpayStub');

  async createOrder(amount: number, currency: string, receipt: string): Promise<RazorpayOrder> {
    const orderId = `order_stub_${randomUUID().slice(0, 12)}`;
    this.logger.log(`[STUB] createOrder ${orderId} amount=${amount} ${currency} receipt=${receipt}`);
    return {
      orderId,
      amount,
      currency,
      keyId: process.env.RAZORPAY_KEY_ID ?? 'rzp_test_stub',
    };
  }

  verifySignature(orderId: string, paymentId: string, signature: string): boolean {
    this.logger.log(`[STUB] verifySignature order=${orderId} payment=${paymentId} sig=${signature}`);
    // Stub always accepts. Real impl: HMAC SHA256 (orderId|paymentId, RAZORPAY_KEY_SECRET) === signature
    return true;
  }
}
