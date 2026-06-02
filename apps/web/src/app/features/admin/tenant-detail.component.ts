import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FEATURE_LABELS, FeatureKey, TenantDetail, TenantUser } from '@lms/shared';
import { AdminApiService } from './admin.service';
import { ToastService } from '../../core/services/toast.service';

type Tab = 'overview' | 'users' | 'features';

@Component({
  selector: 'lms-tenant-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
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

