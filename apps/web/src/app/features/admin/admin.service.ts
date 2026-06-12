import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  AuditLogRow,
  DbQueryResult,
  DbStats,
  FeatureFlag,
  FeatureKey,
  PaginatedResponse,
  ResetPasswordResult,
  TenantDetail,
  TenantStatus,
  TenantSummary,
  TenantUser,
} from '@lms/shared';

export interface CreateTenantPayload {
  name: string;
  slug: string;
  email: string;
  phone?: string;
  adminEmail: string;
  adminFullName: string;
  adminPassword: string;
}

export interface UpdateTenantPayload {
  name?: string;
  slug?: string;
  email?: string;
  phone?: string;
}

export interface UpdateTenantUserPayload {
  fullName?: string;
  email?: string;
  phone?: string;
  role?: 'CLIENT_ADMIN' | 'BRANCH_ADMIN' | 'STAFF';
}

export interface EmailConfig {
  provider: 'NONE' | 'BREVO' | 'SENDGRID';
  fromEmail: string;
  fromName: string;
  enabled: boolean;
  brevoKeySet: boolean;
  sendgridKeySet: boolean;
}

export interface EmailConfigPayload {
  provider: 'NONE' | 'BREVO' | 'SENDGRID';
  brevoApiKey?: string;
  sendgridApiKey?: string;
  fromEmail?: string;
  fromName?: string;
  enabled?: boolean;
}

export interface AuditQueryParams {
  tenantId?: string;
  method?: string;
  statusCode?: number;
  entity?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/admin`;

  // ----- Tenants -----
  listTenants() {
    return this.http.get<TenantSummary[]>(`${this.base}/tenants`);
  }
  tenantDetail(id: string) {
    return this.http.get<TenantDetail>(`${this.base}/tenants/${id}`);
  }
  createTenant(dto: CreateTenantPayload) {
    return this.http.post<TenantSummary>(`${this.base}/tenants`, dto);
  }
  updateTenant(id: string, dto: UpdateTenantPayload) {
    return this.http.put<TenantSummary>(`${this.base}/tenants/${id}`, dto);
  }
  /** URL for the SuperAdmin full-database .sql backup (downloaded via fetch + bearer token). */
  fullBackupSqlUrl(): string { return `${this.base}/backup/sql`; }
  setTenantStatus(id: string, status: TenantStatus) {
    return this.http.put<TenantSummary>(`${this.base}/tenants/${id}/status`, { status });
  }
  updateTenantUser(tenantId: string, userId: string, dto: UpdateTenantUserPayload) {
    return this.http.put<TenantUser>(`${this.base}/tenants/${tenantId}/users/${userId}`, dto);
  }
  resetUserPassword(tenantId: string, userId: string, newPassword?: string) {
    return this.http.post<ResetPasswordResult>(
      `${this.base}/tenants/${tenantId}/users/${userId}/reset-password`,
      newPassword ? { newPassword } : {},
    );
  }
  setUserActive(tenantId: string, userId: string, isActive: boolean) {
    return this.http.put<{ id: string; isActive: boolean }>(
      `${this.base}/tenants/${tenantId}/users/${userId}/active`,
      { isActive },
    );
  }

  // ----- Email integration -----
  getEmailConfig(tenantId: string) {
    return this.http.get<EmailConfig>(`${this.base}/tenants/${tenantId}/email-config`);
  }
  saveEmailConfig(tenantId: string, dto: EmailConfigPayload) {
    return this.http.put<EmailConfig>(`${this.base}/tenants/${tenantId}/email-config`, dto);
  }
  sendTestEmail(tenantId: string, to: string) {
    return this.http.post<{ ok: boolean; provider?: string }>(`${this.base}/tenants/${tenantId}/email-config/test`, { to });
  }

  // ----- Feature flags (reuses the existing feature-flags API) -----
  toggleFeature(tenantId: string, key: FeatureKey, enabled: boolean) {
    return this.http.put<FeatureFlag>(
      `${environment.apiUrl}/feature-flags/tenants/${tenantId}/${key}`,
      { enabled },
    );
  }

  // ----- Audit log -----
  auditLogs(q: AuditQueryParams) {
    let params = new HttpParams();
    Object.entries(q).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    });
    return this.http.get<PaginatedResponse<AuditLogRow>>(`${this.base}/audit-logs`, { params });
  }

  // ----- DB console -----
  runQuery(sql: string, confirmWrite = false) {
    return this.http.post<DbQueryResult>(`${this.base}/db/query`, { sql, confirmWrite });
  }
  dbStats() {
    return this.http.get<DbStats>(`${this.base}/db/stats`);
  }
}
