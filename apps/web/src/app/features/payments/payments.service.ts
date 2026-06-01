import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { PaymentMethod } from '@lms/shared';

export interface PaymentRow {
  id: string;
  amount: number;
  method: PaymentMethod;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  createdAt: string;
  paidAt: string | null;
  notes: string | null;
  student: { id: string; code: string; fullName: string; phone: string; email: string | null };
  branch?: { id: string; name: string; code: string } | null;
}

export interface CreatePaymentDto {
  studentId: string;
  branchId: string;
  amount: number;
  method: PaymentMethod;
  notes?: string;
  nextDueDate?: string;
}

@Injectable({ providedIn: 'root' })
export class PaymentsApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/payments`;

  list(opts: { branchId?: string; status?: string; dateFrom?: string; dateTo?: string; limit?: number } = {}) {
    let params = new HttpParams();
    if (opts.branchId) params = params.set('branchId', opts.branchId);
    if (opts.status) params = params.set('status', opts.status);
    if (opts.dateFrom) params = params.set('dateFrom', opts.dateFrom);
    if (opts.dateTo) params = params.set('dateTo', opts.dateTo);
    if (opts.limit) params = params.set('limit', String(opts.limit));
    return this.http.get<PaymentRow[]>(this.base, { params });
  }

  recordManual(dto: CreatePaymentDto) {
    return this.http.post<PaymentRow>(`${this.base}/manual`, dto);
  }
}
