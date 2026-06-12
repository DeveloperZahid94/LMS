import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuditLogRow, PaginatedResponse } from '@lms/shared';

export interface TenantAuditQuery {
  method?: string;
  entity?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  limit?: number;
}

/** Tenant-scoped audit trail — always the caller's own tenant (server enforces). */
@Injectable({ providedIn: 'root' })
export class AuditApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/audit-logs`;

  list(q: TenantAuditQuery): Observable<PaginatedResponse<AuditLogRow>> {
    return this.http.get<PaginatedResponse<AuditLogRow>>(this.base, { params: this.params(q) });
  }

  exportCsv(q: TenantAuditQuery): Observable<Blob> {
    return this.http.get(`${this.base}/export`, {
      params: this.params(q),
      responseType: 'blob',
    });
  }

  private params(q: TenantAuditQuery): HttpParams {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(q)) {
      if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
    }
    return p;
  }
}
