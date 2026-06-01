import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface SmsSettings {
  provider: 'msg91';
  apiKey: string;
  senderId: string;
  templates: { day7: string; dueToday: string; overdue: string };
  schedule: { day7Enabled: boolean; dueTodayEnabled: boolean; overdueEnabled: boolean; hour: number };
}

export interface BiometricSettings {
  ipAddress: string;
  port: number;
  password: string;
  mockMode: boolean;
}

export interface SecuritySettings {
  autoLogoutMin: number;
  allowMultipleSessions: boolean;
  failedLoginLockoutEnabled: boolean;
  failedLoginAttempts: number;
  lockoutDurationMin: number;
  newDeviceLoginAlert: boolean;
}

export interface BackupSettings {
  autoEnabled: boolean;
  time: string;
  frequency: 'daily' | 'weekly';
  retentionDays: number;
}

export interface BusinessSettings {
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
}

export interface AllSettings {
  sms: SmsSettings;
  biometric: BiometricSettings;
  security: SecuritySettings;
  backup: BackupSettings;
  business: BusinessSettings;
}

export interface ProfileResponse {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  branchId: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class SettingsApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/settings`;
  private auth = `${environment.apiUrl}/auth`;

  // Tenant-level settings
  get() { return this.http.get<AllSettings>(this.base); }
  update(patch: Partial<AllSettings>) { return this.http.put<AllSettings>(this.base, patch); }

  testBiometric(body: { ipAddress: string; port: number; password?: string; mockMode?: boolean }) {
    return this.http.post<{ ok: boolean; message: string; mode: string }>(`${this.base}/biometric/test`, body);
  }

  backupUrl(): string { return `${this.base}/backup`; }

  // Auth / profile
  getProfile() { return this.http.get<ProfileResponse>(`${this.auth}/profile`); }
  updateProfile(dto: { fullName?: string; email?: string; phone?: string }) {
    return this.http.patch<ProfileResponse>(`${this.auth}/profile`, dto);
  }
  changePassword(dto: { currentPassword: string; newPassword: string }) {
    return this.http.post<{ ok: boolean }>(`${this.auth}/change-password`, dto);
  }
}
