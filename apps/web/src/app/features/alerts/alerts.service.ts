import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type AlertKind = 'OVERDUE' | 'DUE_SOON' | 'EXPIRING' | 'BALANCE';

interface StudentRef { id: string; code: string; fullName: string; phone: string; }
interface SeatRef    { id: string; code: string; type: string; branchId: string; }

export interface OverdueAlert {
  id: string;
  kind: 'OVERDUE';
  student: StudentRef;
  seat: SeatRef;
  shift: string;
  nextDueDate: string;
  daysPast: number;
  monthlyRate: number | null;
  summary: string;
}
export interface DueSoonAlert {
  id: string;
  kind: 'DUE_SOON';
  student: StudentRef;
  seat: SeatRef;
  shift: string;
  nextDueDate: string;
  daysUntil: number;
  monthlyRate: number | null;
  summary: string;
}
export interface ExpiringAlert {
  id: string;
  kind: 'EXPIRING';
  student: StudentRef;
  expiresAt: string;
  daysUntil: number;
  summary: string;
}

export interface BalanceAlert {
  id: string;
  kind: 'BALANCE';
  student: StudentRef;
  amount: number;
  summary: string;
}

export interface AlertsResponse {
  overdue: OverdueAlert[];
  dueSoon: DueSoonAlert[];
  expiringSoon: ExpiringAlert[];
  balanceDue: BalanceAlert[];
  counts: { overdue: number; dueSoon: number; expiringSoon: number; balanceDue: number; total: number };
}

export type NotifyChannel = 'EMAIL' | 'SMS' | 'WHATSAPP';
export interface NotifyRecipient { studentId: string; message: string; subject?: string }
export interface NotifyResult { channel: NotifyChannel; total: number; sent: number; failed: number; errors: string[] }

@Injectable({ providedIn: 'root' })
export class AlertsApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/alerts`;

  list(opts: { branchId?: string; search?: string; dateFrom?: string; dateTo?: string } = {}) {
    let params = new HttpParams();
    if (opts.branchId) params = params.set('branchId', opts.branchId);
    if (opts.search) params = params.set('search', opts.search);
    if (opts.dateFrom) params = params.set('dateFrom', opts.dateFrom);
    if (opts.dateTo) params = params.set('dateTo', opts.dateTo);
    return this.http.get<AlertsResponse>(this.base, { params });
  }

  notify(channel: NotifyChannel, recipients: NotifyRecipient[]) {
    return this.http.post<NotifyResult>(`${this.base}/notify`, { channel, recipients });
  }
}
