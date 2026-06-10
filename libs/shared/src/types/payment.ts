export enum PaymentMethod {
  CASH = 'CASH',
  UPI = 'UPI',
  CARD = 'CARD',
  NETBANKING = 'NETBANKING',
  RAZORPAY = 'RAZORPAY',
  OTHER = 'OTHER',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

/** Which service a payment is for — drives per-service (seat/PG/tiffin) dues. */
export enum PaymentPurpose {
  SEAT = 'SEAT',
  PG = 'PG',
  TIFFIN = 'TIFFIN',
  GENERAL = 'GENERAL',
}

export interface Payment {
  id: string;
  tenantId: string;
  branchId: string;
  studentId: string;
  enrollmentId: string | null;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface CreatePaymentDto {
  studentId: string;
  branchId: string;
  amount: number;
  method: PaymentMethod;
  enrollmentId?: string;
  notes?: string;
  purpose?: PaymentPurpose;
}

export interface RazorpayOrderResponse {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}
