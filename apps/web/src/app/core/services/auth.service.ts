import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse, AuthUser, FeatureFlag, FeatureKey, LoginRequest } from '@lms/shared';

const TOKEN_KEY = 'lms.token';
const REFRESH_KEY = 'lms.refresh';
const USER_KEY = 'lms.user';
const FLAGS_KEY = 'lms.flags';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  user = signal<AuthUser | null>(this.readJson<AuthUser>(USER_KEY));
  features = signal<FeatureFlag[]>(this.readJson<FeatureFlag[]>(FLAGS_KEY) ?? []);
  isLoggedIn = computed(() => !!this.user());

  login(req: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/login`, req).pipe(
      tap((res) => this.setSession(res)),
    );
  }

  /** Password-only platform-owner login (dedicated /superadmin route). */
  superAdminLogin(password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/superadmin-login`, { password }).pipe(
      tap((res) => this.setSession(res)),
    );
  }

  /** Student self-service login for the check-in kiosk (tenant + code + password). */
  studentLogin(req: { tenantSlug: string; code: string; password: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/student-login`, req).pipe(
      tap((res) => this.setSession(res)),
    );
  }

  /** Student changing their own kiosk password. */
  studentChangePassword(currentPassword: string, newPassword: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${environment.apiUrl}/auth/student-change-password`, { currentPassword, newPassword });
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(FLAGS_KEY);
    this.user.set(null);
    this.features.set([]);
    this.router.navigate(['/login']);
  }

  get accessToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  hasFeature(key: FeatureKey): boolean {
    return this.features().some((f) => f.key === key && f.enabled);
  }

  /** Merge a partial update into the cached user (e.g. clearing mustChangePassword). */
  updateUser(patch: Partial<AuthUser>) {
    const current = this.user();
    if (!current) return;
    const next = { ...current, ...patch };
    localStorage.setItem(USER_KEY, JSON.stringify(next));
    this.user.set(next);
  }

  private setSession(res: AuthResponse) {
    localStorage.setItem(TOKEN_KEY, res.accessToken);
    localStorage.setItem(REFRESH_KEY, res.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    localStorage.setItem(FLAGS_KEY, JSON.stringify(res.features));
    this.user.set(res.user);
    this.features.set(res.features);
  }

  private readJson<T>(key: string): T | null {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  }
}
