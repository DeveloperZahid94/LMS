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
