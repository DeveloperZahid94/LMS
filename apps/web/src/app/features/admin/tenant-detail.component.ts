import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FEATURE_LABELS, FeatureKey, TenantDetail, TenantUser } from '@lms/shared';
import { AdminApiService, EmailConfig } from './admin.service';
import { ToastService } from '../../core/services/toast.service';

type Tab = 'overview' | 'users' | 'features' | 'email';

@Component({
  selector: 'lms-tenant-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="mb-4">
      <a routerLink="/admin/tenants" class="link link-hover text-sm opacity-70">← Tenants</a>
    </div>

    <div *ngIf="loading()" class="text-center py-10"><span class="loading loading-spinner loading-md"></span></div>

    <ng-container *ngIf="!loading() && tenant() as t">
      <div class="flex items-end justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 class="text-2xl font-bold flex items-center gap-2">
            {{ t.name }}
            <span class="badge badge-sm"
              [class.badge-success]="t.status === 'ACTIVE'"
              [class.badge-warning]="t.status === 'TRIAL' || t.status === 'SUSPENDED'"
              [class.badge-error]="t.status === 'CANCELLED'">{{ t.status }}</span>
          </h1>
          <p class="text-sm opacity-60 mt-1 font-mono">{{ t.slug }} · {{ t.email }}</p>
        </div>
      </div>

      <div role="tablist" class="tabs tabs-bordered mb-4">
        <a role="tab" class="tab" [class.tab-active]="tab() === 'overview'" (click)="tab.set('overview')">Overview</a>
        <a role="tab" class="tab" [class.tab-active]="tab() === 'users'" (click)="tab.set('users')">Users ({{ t.users.length }})</a>
        <a role="tab" class="tab" [class.tab-active]="tab() === 'features'" (click)="tab.set('features')">Features</a>
        <a role="tab" class="tab" [class.tab-active]="tab() === 'email'" (click)="tab.set('email'); loadEmail()">Email</a>
      </div>

      <!-- OVERVIEW -->
      <div *ngIf="tab() === 'overview'" class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="card bg-base-100 border border-base-300 p-4">
          <div class="text-[11px] uppercase tracking-wider opacity-60">Plan</div>
          <div class="text-xl font-bold">{{ t.plan | titlecase }}</div>
        </div>
        <div class="card bg-base-100 border border-base-300 p-4">
          <div class="text-[11px] uppercase tracking-wider opacity-60">Users</div>
          <div class="text-xl font-bold">{{ t._count?.users ?? t.users.length }}</div>
        </div>
        <div class="card bg-base-100 border border-base-300 p-4">
          <div class="text-[11px] uppercase tracking-wider opacity-60">Students</div>
          <div class="text-xl font-bold">{{ t._count?.students ?? 0 }}</div>
        </div>
        <div class="card bg-base-100 border border-base-300 p-4">
          <div class="text-[11px] uppercase tracking-wider opacity-60">Branches</div>
          <div class="text-xl font-bold">{{ t._count?.branches ?? 0 }}</div>
        </div>
      </div>

      <!-- USERS -->
      <div *ngIf="tab() === 'users'" class="card bg-base-100 border border-base-300 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="table">
            <thead class="bg-base-200">
              <tr class="text-xs uppercase tracking-wider">
                <th>User</th><th>Role</th><th>Last login</th><th>Status</th><th class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let u of t.users" class="hover">
                <td>
                  <div class="font-medium">{{ u.fullName }}</div>
                  <div class="text-xs opacity-60">{{ u.email }}</div>
                  <span *ngIf="u.mustChangePassword" class="badge badge-warning badge-xs mt-1">must change password</span>
                </td>
                <td><span class="badge badge-outline badge-sm">{{ u.role }}</span></td>
                <td class="text-xs">{{ u.lastLoginAt ? (u.lastLoginAt | date:'dd MMM yy, HH:mm') : 'never' }}</td>
                <td>
                  <span class="badge badge-sm" [class.badge-success]="u.isActive" [class.badge-ghost]="!u.isActive">
                    {{ u.isActive ? 'Active' : 'Disabled' }}
                  </span>
                </td>
                <td class="text-right whitespace-nowrap">
                  <button class="btn btn-ghost btn-xs" (click)="resetPassword(u)">Reset password</button>
                  <button class="btn btn-ghost btn-xs" (click)="toggleActive(u)">
                    {{ u.isActive ? 'Disable' : 'Enable' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- FEATURES / MENU ACCESS -->
      <div *ngIf="tab() === 'features'">
        <p class="text-sm opacity-70 mb-3">
          Control what this tenant can access. Turning a feature off hides the matching menu item in their app.
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div *ngFor="let f of t.features"
               class="card bg-base-100 border shadow-sm transition-colors"
               [class.border-primary]="f.enabled" [class.border-base-300]="!f.enabled">
            <div class="card-body p-3 flex-row items-center justify-between gap-2">
              <div class="min-w-0">
                <div class="font-medium text-sm truncate">{{ labels[f.key] }}</div>
                <div class="text-[11px] opacity-60">Menu: {{ menuFor(f.key) }}</div>
              </div>
              <input type="checkbox" class="toggle toggle-primary toggle-sm" [checked]="f.enabled"
                     (change)="toggleFeature(f.key, !f.enabled)" />
            </div>
          </div>
        </div>
      </div>

      <!-- EMAIL INTEGRATION -->
      <div *ngIf="tab() === 'email'" class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div class="card bg-base-100 border border-base-300 shadow-sm">
          <div class="card-body p-5">
            <div class="font-semibold mb-1">Email Provider</div>
            <p class="text-sm opacity-60 mb-3">Configure how this tenant sends emails (receipts, reminders).</p>
            <div *ngIf="!emailCfg()" class="text-center py-6"><span class="loading loading-spinner"></span></div>
            <div *ngIf="emailCfg() as cfg" class="space-y-3">
              <label class="form-control">
                <div class="label py-1"><span class="label-text">Provider</span></div>
                <select class="select select-bordered select-sm" [(ngModel)]="provider">
                  <option value="NONE">None (disabled)</option>
                  <option value="BREVO">Brevo</option>
                  <option value="SENDGRID">SendGrid</option>
                </select>
              </label>

              <label class="form-control" *ngIf="provider === 'BREVO'">
                <div class="label py-1"><span class="label-text">Brevo API key</span>
                  <span class="label-text-alt text-success" *ngIf="cfg.brevoKeySet">✓ saved</span></div>
                <input class="input input-bordered input-sm" type="password" [(ngModel)]="brevoApiKey"
                       [placeholder]="cfg.brevoKeySet ? '•••••• (leave blank to keep)' : 'xkeysib-…'" />
              </label>

              <label class="form-control" *ngIf="provider === 'SENDGRID'">
                <div class="label py-1"><span class="label-text">SendGrid API key</span>
                  <span class="label-text-alt text-success" *ngIf="cfg.sendgridKeySet">✓ saved</span></div>
                <input class="input input-bordered input-sm" type="password" [(ngModel)]="sendgridApiKey"
                       [placeholder]="cfg.sendgridKeySet ? '•••••• (leave blank to keep)' : 'SG.…'" />
              </label>

              <div class="grid grid-cols-2 gap-3">
                <label class="form-control">
                  <div class="label py-1"><span class="label-text">From email</span></div>
                  <input class="input input-bordered input-sm" type="email" [(ngModel)]="fromEmail" placeholder="no-reply@yourlib.com" />
                </label>
                <label class="form-control">
                  <div class="label py-1"><span class="label-text">From name</span></div>
                  <input class="input input-bordered input-sm" [(ngModel)]="fromName" placeholder="Acme Library" />
                </label>
              </div>

              <label class="flex items-center justify-between p-3 rounded-lg bg-base-200">
                <div>
                  <div class="font-medium text-sm">Enabled</div>
                  <div class="text-xs opacity-60">Turn on to allow this tenant to send emails</div>
                </div>
                <input type="checkbox" class="toggle toggle-primary" [(ngModel)]="enabled" />
              </label>

              <div class="flex justify-end">
                <button class="btn btn-primary btn-sm" (click)="saveEmail()" [disabled]="emailSaving()">
                  <span *ngIf="emailSaving()" class="loading loading-spinner loading-xs"></span> Save
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="card bg-base-100 border border-base-300 shadow-sm">
          <div class="card-body p-5">
            <div class="font-semibold mb-1">Send a test email</div>
            <p class="text-sm opacity-60 mb-3">Verifies the saved provider + key actually deliver.</p>
            <label class="form-control">
              <div class="label py-1"><span class="label-text">Send to</span></div>
              <input class="input input-bordered input-sm" type="email" [(ngModel)]="testTo" placeholder="you@example.com" />
            </label>
            <div class="flex justify-end mt-3">
              <button class="btn btn-outline btn-sm" (click)="testEmail()" [disabled]="!testTo || emailTesting()">
                <span *ngIf="emailTesting()" class="loading loading-spinner loading-xs"></span> ✉ Send test
              </button>
            </div>
            <div class="text-xs opacity-60 mt-3">
              Provider docs: Brevo → SMTP & API → API Keys · SendGrid → Settings → API Keys (Mail Send scope).
            </div>
          </div>
        </div>
      </div>
    </ng-container>

    <!-- Reset-password result modal -->
    <dialog class="modal" [class.modal-open]="!!resetResult()">
      <div class="modal-box" *ngIf="resetResult() as r">
        <h3 class="font-bold text-lg">Temporary password</h3>
        <p class="py-2 text-sm opacity-70">
          Share this with the user (WhatsApp/call). They'll be required to set a new password on next login.
          It won't be shown again.
        </p>
        <div class="flex items-center gap-2">
          <code class="bg-base-200 px-3 py-2 rounded text-lg flex-1">{{ r.tempPassword }}</code>
          <button class="btn btn-sm" (click)="copy(r.tempPassword)">Copy</button>
        </div>
        <div class="modal-action">
          <button class="btn btn-primary" (click)="resetResult.set(null)">Done</button>
        </div>
      </div>
    </dialog>
  `,
})
export class TenantDetailComponent implements OnInit {
  private api = inject(AdminApiService);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  tenant = signal<TenantDetail | null>(null);
  loading = signal(false);
  tab = signal<Tab>('overview');
  resetResult = signal<{ userId: string; tempPassword: string } | null>(null);
  labels = FEATURE_LABELS;

  // Email config
  emailCfg = signal<EmailConfig | null>(null);
  provider: 'NONE' | 'BREVO' | 'SENDGRID' = 'NONE';
  brevoApiKey = '';
  sendgridApiKey = '';
  fromEmail = '';
  fromName = '';
  enabled = false;
  testTo = '';
  emailSaving = signal(false);
  emailTesting = signal(false);

  private id = '';

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.reload();
  }

  reload() {
    this.loading.set(true);
    this.api.tenantDetail(this.id).subscribe({
      next: (t) => { this.tenant.set(t); this.loading.set(false); },
      error: () => { this.toast.error('Could not load tenant'); this.loading.set(false); },
    });
  }

  loadEmail() {
    if (this.emailCfg()) return; // load once
    this.api.getEmailConfig(this.id).subscribe({
      next: (c) => {
        this.emailCfg.set(c);
        this.provider = c.provider;
        this.fromEmail = c.fromEmail;
        this.fromName = c.fromName;
        this.enabled = c.enabled;
      },
      error: () => this.toast.error('Could not load email config'),
    });
  }

  saveEmail() {
    this.emailSaving.set(true);
    this.api.saveEmailConfig(this.id, {
      provider: this.provider,
      brevoApiKey: this.brevoApiKey || undefined,
      sendgridApiKey: this.sendgridApiKey || undefined,
      fromEmail: this.fromEmail || undefined,
      fromName: this.fromName || undefined,
      enabled: this.enabled,
    }).subscribe({
      next: (c) => {
        this.emailCfg.set(c);
        this.brevoApiKey = ''; this.sendgridApiKey = '';
        this.emailSaving.set(false);
        this.toast.success('Email settings saved');
      },
      error: (err) => { this.toast.error(err.error?.message ?? 'Could not save'); this.emailSaving.set(false); },
    });
  }

  testEmail() {
    if (!this.testTo) return;
    this.emailTesting.set(true);
    this.api.sendTestEmail(this.id, this.testTo).subscribe({
      next: (r) => { this.toast.success(`Test email sent via ${r.provider}`); this.emailTesting.set(false); },
      error: (err) => { this.toast.error(err.error?.message ?? 'Test failed'); this.emailTesting.set(false); },
    });
  }

  resetPassword(u: TenantUser) {
    this.api.resetUserPassword(this.id, u.id).subscribe({
      next: (res) => {
        this.resetResult.set(res);
        this.tenant.update((t) => t && {
          ...t, users: t.users.map((x) => (x.id === u.id ? { ...x, mustChangePassword: true } : x)),
        });
      },
      error: () => this.toast.error('Could not reset password'),
    });
  }

  toggleActive(u: TenantUser) {
    this.api.setUserActive(this.id, u.id, !u.isActive).subscribe({
      next: () => {
        this.tenant.update((t) => t && {
          ...t, users: t.users.map((x) => (x.id === u.id ? { ...x, isActive: !u.isActive } : x)),
        });
        this.toast.success(`${u.fullName} ${!u.isActive ? 'enabled' : 'disabled'}`);
      },
      error: () => this.toast.error('Could not update user'),
    });
  }

  toggleFeature(key: FeatureKey, enabled: boolean) {
    this.api.toggleFeature(this.id, key, enabled).subscribe({
      next: () => {
        this.tenant.update((t) => t && {
          ...t, features: t.features.map((f) => (f.key === key ? { ...f, enabled } : f)),
        });
      },
      error: () => this.toast.error('Could not toggle feature'),
    });
  }

  copy(text: string) {
    navigator.clipboard?.writeText(text).then(
      () => this.toast.success('Copied'),
      () => this.toast.error('Copy failed'),
    );
  }

  /** Which sidebar menu / area each feature gates — shown as a hint on the toggle card. */
  menuFor(key: FeatureKey): string {
    const map: Record<string, string> = {
      QR_ATTENDANCE: 'Attendance',
      WHATSAPP: 'WhatsApp',
      REPORTS: 'Reports',
      PAYMENT_GATEWAY: 'Payments',
      ANALYTICS: 'Dashboard analytics',
      MULTI_BRANCH: 'Branches',
      EXPORTS: 'Data exports',
      PG_ROOMS: 'PG Rooms',
      DASHBOARD: 'Dashboard',
      STUDENTS: 'Students',
      SEATS: 'Seats',
      ALERTS: 'Alerts',
      SETTINGS: 'Settings',
    };
    return map[key] ?? '—';
  }
}

