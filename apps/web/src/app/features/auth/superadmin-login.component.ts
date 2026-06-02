import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { ToastContainerComponent } from '../../shared/components/toast-container.component';

@Component({
  selector: 'lms-superadmin-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ToastContainerComponent],
  template: `
    <lms-toast-container />
    <div class="min-h-screen flex items-center justify-center bg-neutral text-neutral-content p-4">
      <div class="card bg-base-100 text-base-content shadow-xl w-full max-w-sm">
        <div class="card-body">
          <div class="flex items-center gap-3 mb-1">
            <div class="w-10 h-10 rounded-lg bg-neutral text-neutral-content grid place-items-center font-bold text-lg">⚡</div>
            <div>
              <h2 class="card-title leading-tight">Platform Console</h2>
              <p class="text-xs opacity-60">SuperAdmin access</p>
            </div>
          </div>

          <form (ngSubmit)="submit()" class="mt-4 space-y-3">
            <label class="form-control w-full">
              <div class="label py-1"><span class="label-text">Master password</span></div>
              <input class="input input-bordered" type="password" [(ngModel)]="password" name="password"
                     autocomplete="current-password" autofocus placeholder="••••••••" />
            </label>
            <button class="btn btn-neutral w-full" type="submit" [disabled]="!password || loading()">
              <span *ngIf="loading()" class="loading loading-spinner loading-sm"></span>
              {{ loading() ? 'Signing in…' : 'Enter console' }}
            </button>
          </form>

          <div class="divider text-xs my-2"></div>
          <a routerLink="/login" class="link link-hover text-xs opacity-70 text-center">← Tenant / staff login</a>
        </div>
      </div>
    </div>
  `,
})
export class SuperadminLoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  password = '';
  loading = signal(false);

  submit() {
    if (!this.password) return;
    this.loading.set(true);
    this.auth.superAdminLogin(this.password).subscribe({
      next: () => {
        this.toast.success('Welcome, SuperAdmin');
        this.router.navigate(['/admin/tenants']);
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
