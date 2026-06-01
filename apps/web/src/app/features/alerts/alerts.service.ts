import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type AlertKind = 'OVERDUE' | 'DUE_SOON' | 'EXPIRING';

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

export interface AlertsResponse {
  overdue: OverdueAlert[];
  dueSoon: DueSoonAlert[];
  expiringSoon: ExpiringAlert[];
  counts: { overdue: number; dueSoon: number; expiringSoon: number; total: number };
}

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
}
