import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { PaymentMethod, PaginatedResponse } from '@lms/shared';

export interface PaymentRow {
  id: string;
  amount: number;
  discount?: number;
  discountReason?: string | null;
  method: PaymentMethod;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  createdAt: string;
  paidAt: string | null;
  notes: string | null;
  student: { id: string; code: string; fullName: string; phone: string; email: string | null };
  branch?: { id: string; name: string; code: string } | null;
  monthlyFee?: number;
  balance?: number;
}

export interface CreatePaymentDto {
  studentId: string;
  branchId: string;
  amount: number;
  discount?: number;
  discountReason?: string;
  method: PaymentMethod;
  notes?: string;
  nextDueDate?: string;
  applyToAccount?: boolean;
  /** Which service this payment is for — drives per-service dues. */
  purpose?: 'SEAT' | 'PG' | 'TIFFIN' | 'GENERAL';
}

export interface PaymentHistoryItem {
  id: string;
  amount: number;
  discount?: number;
  discountReason?: string | null;
  method: PaymentMethod;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  paidAt: string | null;
  createdAt: string;
  notes: string | null;
}

export interface PaymentAllocation {
  type: 'SEAT' | 'PG';
  label: string;
  monthlyRate: number;
  nextDueDate: string | null;
}

export interface ServiceDue {
  expected: number;
  paid: number;
  due: number;
  active: boolean;
}

export interface DuesBreakdown {
  seat: ServiceDue;
  pg: ServiceDue;
  tiffin: ServiceDue;
  generalPaid: number;
  totalDue: number;
}

export interface PaymentSummary {
  student: { id: string; code: string; fullName: string; phone: string };
  payments: PaymentHistoryItem[];
  totalPaid: number;
  monthlyTotal: number;
  allocations: PaymentAllocation[];
  breakdown: DuesBreakdown;
}

@Injectable({ providedIn: 'root' })
export class PaymentsApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/payments`;

  list(opts: {
    branchId?: string; status?: string; dateFrom?: string; dateTo?: string;
    search?: string; sortBy?: 'date' | 'amount' | 'student'; sortOrder?: 'asc' | 'desc';
    page?: number; limit?: number;
  } = {}) {
    let params = new HttpParams();
    Object.entries(opts).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    });
    return this.http.get<PaginatedResponse<PaymentRow>>(this.base, { params });
  }

  recordManual(dto: CreatePaymentDto) {
    return this.http.post<PaymentRow>(`${this.base}/manual`, dto);
  }

  studentSummary(studentId: string) {
    return this.http.get<PaymentSummary>(`${this.base}/students/${studentId}/summary`);
  }

  deletePayment(id: string, reason: string) {
    return this.http.post<{ ok: boolean }>(`${this.base}/${id}/delete`, { reason });
  }

  emailReceipt(id: string) {
    return this.http.post<{ ok: boolean }>(`${this.base}/${id}/email-receipt`, {});
  }
}
