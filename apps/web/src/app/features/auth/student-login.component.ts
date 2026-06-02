import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import { ToastContainerComponent } from '../../shared/components/toast-container.component';

@Component({
  selector: 'lms-student-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ToastContainerComponent],
  template: `
    <lms-toast-container />
    <div [attr.data-theme]="theme.theme()" class="min-h-screen flex items-center justify-center bg-base-200 p-4 relative">
      <button class="btn btn-ghost btn-sm btn-circle absolute top-3 right-3" (click)="theme.toggle()" [title]="theme.theme() === 'dark' ? 'Light mode' : 'Dark mode'">
        <span *ngIf="theme.theme() === 'dark'">☀</span>
        <span *ngIf="theme.theme() === 'light'">☾</span>
      </button>
      <div class="card bg-base-100 shadow-xl w-full max-w-sm">
        <div class="card-body">
          <div class="flex items-center gap-3 mb-1">
            <div class="w-10 h-10 rounded-lg bg-primary text-primary-content grid place-items-center font-bold text-lg">✓</div>
            <div>
              <h2 class="card-title leading-tight">Student Check-In</h2>
              <p class="text-xs opacity-60">Sign in to mark your attendance</p>
            </div>
          </div>

          <form (ngSubmit)="submit()" class="mt-4 space-y-3">
            <label class="form-control w-full">
              <div class="label py-1"><span class="label-text">Library code</span></div>
              <input class="input input-bordered" [(ngModel)]="tenantSlug" name="tenantSlug" placeholder="demo-library" autocapitalize="off" />
            </label>
            <label class="form-control w-full">
              <div class="label py-1"><span class="label-text">Student code</span></div>
              <input class="input input-bordered" [(ngModel)]="code" name="code" placeholder="STU-0001" autocapitalize="characters" />
            </label>
            <label class="form-control w-full">
              <div class="label py-1"><span class="label-text">Password</span></div>
              <input class="input input-bordered" type="password" [(ngModel)]="password" name="password" placeholder="••••••••" autocomplete="current-password" />
              <div class="label py-1"><span class="label-text-alt opacity-60">First time? Use your phone number as the password.</span></div>
            </label>
            <button class="btn btn-primary w-full" type="submit" [disabled]="!tenantSlug || !code || !password || loading()">
              <span *ngIf="loading()" class="loading loading-spinner loading-sm"></span>
              {{ loading() ? 'Signing in…' : 'Sign in' }}
            </button>
          </form>

          <div class="divider text-xs my-2"></div>
          <a routerLink="/login" class="link link-hover text-xs opacity-70 text-center">Staff / admin login →</a>
        </div>
      </div>
    </div>
  `,
})
export class StudentLoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);
  theme = inject(ThemeService);

  tenantSlug = '';
  code = '';
  password = '';
  loading = signal(false);

  submit() {
    if (!this.tenantSlug || !this.code || !this.password) return;
    this.loading.set(true);
    this.auth.studentLogin({ tenantSlug: this.tenantSlug.trim(), code: this.code.trim(), password: this.password }).subscribe({
      next: () => this.router.navigate(['/checkin']),
      error: (err) => {
        const msg = err.error?.message ?? 'Login failed';
        this.toast.error(Array.isArray(msg) ? msg.join(' · ') : msg);
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
  }
}
