import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { ToastContainerComponent } from '../../shared/components/toast-container.component';

@Component({
  selector: 'lms-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ToastContainerComponent],
  template: `
    <lms-toast-container />
    <div class="min-h-screen flex items-center justify-center bg-base-200 p-4">
      <div class="card bg-base-100 shadow-xl w-full max-w-md">
        <div class="card-body">
          <div class="flex items-center gap-3 mb-1">
            <div class="w-10 h-10 rounded-lg bg-primary text-primary-content grid place-items-center font-bold text-lg">L</div>
            <h2 class="card-title">LMS Platform</h2>
          </div>
          <p class="text-sm text-base-content/60">Sign in to your library management portal</p>

          <form [formGroup]="form" (ngSubmit)="submit()" class="mt-4 space-y-3">
            <label class="form-control w-full">
              <div class="label py-1"><span class="label-text">Tenant slug</span></div>
              <input class="input input-bordered" formControlName="tenantSlug" placeholder="demo-library" />
            </label>

            <label class="form-control w-full">
              <div class="label py-1"><span class="label-text">Email</span></div>
              <input class="input input-bordered" type="email" formControlName="email" autocomplete="email" />
            </label>

            <label class="form-control w-full">
              <div class="label py-1"><span class="label-text">Password</span></div>
              <input class="input input-bordered" type="password" formControlName="password" autocomplete="current-password" />
            </label>

            <button class="btn btn-primary w-full" type="submit" [disabled]="form.invalid || loading()">
              <span *ngIf="loading()" class="loading loading-spinner loading-sm"></span>
              {{ loading() ? 'Signing in…' : 'Sign in' }}
            </button>
          </form>

          <div class="text-center mt-2">
            <a routerLink="/superadmin" class="link link-hover text-xs opacity-70">Platform owner? SuperAdmin console →</a>
          </div>

          <div class="divider text-xs">seeded credentials</div>
          <div class="text-xs text-base-content/70 space-y-1">
            <div>ClientAdmin — <code class="bg-base-200 px-1 rounded">admin&#64;demo-library.local</code> / <code class="bg-base-200 px-1 rounded">Admin&#64;123</code> · slug <code class="bg-base-200 px-1 rounded">demo-library</code></div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  loading = signal(false);

  form = this.fb.nonNullable.group({
    tenantSlug: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    const { tenantSlug, email, password } = this.form.getRawValue();
    this.auth.login({ email, password, tenantSlug: tenantSlug || undefined }).subscribe({
      next: (res) => {
        if (res.user.mustChangePassword) {
          this.toast.info('Please set a new password to continue.');
          this.router.navigate(['/change-password']);
          return;
        }
        this.toast.success('Welcome back!');
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        const msg = err.error?.message ?? 'Login failed';
        this.toast.error(Array.isArray(msg) ? msg.join(' · ') : msg);
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
  }
}
