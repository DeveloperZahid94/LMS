import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'lms-change-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="max-w-md mx-auto mt-6">
      <div class="card bg-base-100 border border-base-300 shadow-sm">
        <div class="card-body">
          <h1 class="text-xl font-bold">Change password</h1>
          <p class="text-sm opacity-60" *ngIf="forced()">
            Your password was reset by an administrator. Set a new one to continue.
          </p>

          <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-3 mt-3">
            <label class="form-control">
              <div class="label py-1"><span class="label-text">Current password</span></div>
              <input class="input input-bordered" type="password" formControlName="currentPassword"
                     autocomplete="current-password" />
            </label>
            <label class="form-control">
              <div class="label py-1"><span class="label-text">New password (min 8 chars)</span></div>
              <input class="input input-bordered" type="password" formControlName="newPassword"
                     autocomplete="new-password" />
            </label>
            <label class="form-control">
              <div class="label py-1"><span class="label-text">Confirm new password</span></div>
              <input class="input input-bordered" type="password" formControlName="confirm"
                     autocomplete="new-password" />
            </label>
            <div class="text-error text-xs" *ngIf="mismatch()">Passwords do not match.</div>

            <button class="btn btn-primary w-full" type="submit" [disabled]="form.invalid || mismatch() || saving()">
              <span *ngIf="saving()" class="loading loading-spinner loading-sm"></span>
              Update password
            </button>
          </form>
        </div>
      </div>
    </div>
  `,
})
export class ChangePasswordComponent {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  saving = signal(false);
  forced = computed(() => !!this.auth.user()?.mustChangePassword);

  form = this.fb.nonNullable.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirm: ['', [Validators.required]],
  });

  mismatch(): boolean {
    const { newPassword, confirm } = this.form.getRawValue();
    return !!confirm && newPassword !== confirm;
  }

  submit() {
    if (this.form.invalid || this.mismatch()) return;
    this.saving.set(true);
    const { currentPassword, newPassword } = this.form.getRawValue();
    this.http.post(`${environment.apiUrl}/auth/change-password`, { currentPassword, newPassword }).subscribe({
      next: () => {
        this.auth.updateUser({ mustChangePassword: false });
        this.toast.success('Password updated');
        const role = this.auth.user()?.role;
        this.router.navigate([role === 'SUPER_ADMIN' ? '/admin/tenants' : '/dashboard']);
      },
      error: (err) => {
        const msg = err.error?.message ?? 'Could not change password';
        this.toast.error(Array.isArray(msg) ? msg.join(' · ') : msg);
        this.saving.set(false);
      },
    });
  }
}
