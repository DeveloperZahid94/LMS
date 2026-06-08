import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, Observable, of } from 'rxjs';
import { FEATURE_LABELS, FeatureKey, TenantStatus, TenantSummary } from '@lms/shared';
import { AdminApiService, CreateTenantPayload } from './admin.service';
import { ToastService } from '../../core/services/toast.service';

const STATUSES: TenantStatus[] = ['ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED'];
const FEATURE_KEYS = Object.values(FeatureKey);

@Component({
  selector: 'lms-tenants-list',
  standalone: true,
  host: { class: 'flex flex-col h-[calc(100dvh-5.75rem)] min-h-0 overflow-hidden' },
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="flex items-end justify-between mb-4 flex-wrap gap-2 shrink-0">
      <div>
        <h1 class="text-2xl font-bold">Tenants</h1>
        <p class="text-sm opacity-60 mt-1">Onboard and manage customer accounts</p>
      </div>
      <button class="btn btn-primary btn-sm" (click)="openCreate()">+ New tenant</button>
    </div>

    <!-- Filter bar -->
    <div class="card bg-base-100 border border-base-300 shadow-sm mb-3 shrink-0">
      <div class="p-2 flex flex-row flex-wrap items-center gap-2">
        <label class="input input-bordered input-sm flex items-center gap-2 flex-1 min-w-[240px]">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input class="grow" [(ngModel)]="search" placeholder="Search name, slug, or email…" />
          <button *ngIf="search" class="opacity-60 hover:opacity-100 px-1" (click)="search=''">✕</button>
        </label>
        <select class="select select-bordered select-sm" [(ngModel)]="statusFilter">
          <option value="">All statuses</option>
          <option *ngFor="let s of statuses" [value]="s">{{ s | titlecase }}</option>
        </select>
      </div>
    </div>

    <div *ngIf="loading()" class="flex-1 min-h-0 flex items-center justify-center"><span class="loading loading-spinner loading-md"></span></div>

    <div *ngIf="!loading() && filtered().length === 0" class="flex-1 min-h-0 flex flex-col items-center justify-center text-center opacity-60 card bg-base-100 border border-base-300">
      <div class="text-base mb-1">No tenants match.</div>
      <button class="link link-primary text-sm" (click)="openCreate()">Create your first customer →</button>
    </div>

    <div *ngIf="!loading() && filtered().length > 0" class="card bg-base-100 border border-base-300 shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
      <div class="overflow-auto flex-1 min-h-0">
        <table class="table">
          <thead class="bg-base-200 sticky top-0 z-10">
            <tr class="text-xs uppercase tracking-wider">
              <th>Tenant</th>
              <th>Contact</th>
              <th>Plan</th>
              <th>Usage</th>
              <th>Status</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let t of filtered()" class="hover">
              <td>
                <a class="font-semibold link link-hover" [routerLink]="['/admin/tenants', t.id]">{{ t.name }}</a>
                <div class="text-xs opacity-60 font-mono">{{ t.slug }}</div>
              </td>
              <td class="text-sm">
                <div>{{ t.email }}</div>
                <div class="text-xs opacity-60" *ngIf="t.phone">{{ t.phone }}</div>
              </td>
              <td><span class="badge badge-outline badge-sm">{{ t.plan | titlecase }}</span></td>
              <td class="text-xs">
                <span class="opacity-70">{{ t._count?.users ?? 0 }} users · {{ t._count?.students ?? 0 }} students · {{ t._count?.branches ?? 0 }} branches</span>
              </td>
              <td>
                <select class="select select-bordered select-xs" [ngModel]="t.status"
                        (ngModelChange)="changeStatus(t, $event)"
                        [class.select-success]="t.status === 'ACTIVE'"
                        [class.select-warning]="t.status === 'TRIAL' || t.status === 'SUSPENDED'"
                        [class.select-error]="t.status === 'CANCELLED'">
                  <option *ngFor="let s of statuses" [value]="s">{{ s | titlecase }}</option>
                </select>
              </td>
              <td class="text-right">
                <a class="btn btn-ghost btn-xs" [routerLink]="['/admin/tenants', t.id]">Manage →</a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create wizard -->
    <dialog class="modal" [class.modal-open]="createOpen()">
      <div class="modal-box max-w-xl">
        <form method="dialog"><button type="button" class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" (click)="createOpen.set(false)">✕</button></form>
        <h3 class="font-bold text-lg">New tenant</h3>

        <ul class="steps steps-horizontal w-full my-4 text-xs">
          <li class="step" [class.step-primary]="step() >= 1">Business</li>
          <li class="step" [class.step-primary]="step() >= 2">Admin</li>
          <li class="step" [class.step-primary]="step() >= 3">Features</li>
          <li class="step" [class.step-primary]="step() >= 4">Review</li>
        </ul>

        <form [formGroup]="form">
          <!-- Step 1: Business info -->
          <div *ngIf="step() === 1" class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <label class="form-control">
                <div class="label py-1"><span class="label-text">Business name *</span></div>
                <input class="input input-bordered" formControlName="name" placeholder="Acme Library" (input)="onNameInput()" />
              </label>
              <label class="form-control">
                <div class="label py-1"><span class="label-text">Slug *</span></div>
                <input class="input input-bordered" formControlName="slug" placeholder="acme-library" />
              </label>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <label class="form-control">
                <div class="label py-1"><span class="label-text">Business email *</span></div>
                <input class="input input-bordered" type="email" formControlName="email" />
              </label>
              <label class="form-control">
                <div class="label py-1"><span class="label-text">Phone</span></div>
                <input class="input input-bordered" formControlName="phone" />
              </label>
            </div>
          </div>

          <!-- Step 2: First admin user -->
          <div *ngIf="step() === 2" class="space-y-3">
            <p class="text-sm opacity-60">This person gets the CLIENT_ADMIN login for the tenant.</p>
            <label class="form-control">
              <div class="label py-1"><span class="label-text">Admin full name *</span></div>
              <input class="input input-bordered" formControlName="adminFullName" />
            </label>
            <label class="form-control">
              <div class="label py-1"><span class="label-text">Admin email *</span></div>
              <input class="input input-bordered" type="email" formControlName="adminEmail" />
            </label>
            <label class="form-control">
              <div class="label py-1"><span class="label-text">Admin password *</span></div>
              <input class="input input-bordered" formControlName="adminPassword" placeholder="min 8 characters" />
            </label>
          </div>

          <!-- Step 3: Features / menu access -->
          <div *ngIf="step() === 3" class="space-y-3">
            <p class="text-sm opacity-60">Choose which features this customer's plan includes. You can change these later.</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label *ngFor="let k of featureKeys"
                     class="card border cursor-pointer transition-colors"
                     [class.border-primary]="featuresOn()[k]" [class.border-base-300]="!featuresOn()[k]">
                <div class="card-body p-3 flex-row items-center justify-between gap-2">
                  <span class="text-sm font-medium">{{ labels[k] }}</span>
                  <input type="checkbox" class="toggle toggle-primary toggle-sm"
                         [checked]="featuresOn()[k]" (change)="toggleFeatureChoice(k)" />
                </div>
              </label>
            </div>
          </div>

          <!-- Step 4: Review -->
          <div *ngIf="step() === 4" class="space-y-3 text-sm">
            <div class="bg-base-200 rounded-lg p-3 space-y-1">
              <div><span class="opacity-60">Business:</span> <strong>{{ form.value.name }}</strong> ({{ form.value.slug }})</div>
              <div><span class="opacity-60">Email:</span> {{ form.value.email }}<span *ngIf="form.value.phone"> · {{ form.value.phone }}</span></div>
              <div><span class="opacity-60">Admin:</span> {{ form.value.adminFullName }} &lt;{{ form.value.adminEmail }}&gt;</div>
              <div><span class="opacity-60">Features on:</span> {{ enabledFeatureLabels() || 'none' }}</div>
            </div>
            <p class="text-xs opacity-60">Creating sets up the account, an HQ branch, the admin user, and the selected features.</p>
          </div>

          <div class="modal-action">
            <button type="button" class="btn btn-ghost" (click)="createOpen.set(false)">Cancel</button>
            <button type="button" class="btn" *ngIf="step() > 1" (click)="step.set(step() - 1)">Back</button>
            <button type="button" class="btn btn-primary" *ngIf="step() < 4"
                    [disabled]="!stepValid(step())" (click)="step.set(step() + 1)">Next</button>
            <button type="button" class="btn btn-primary" *ngIf="step() === 4"
                    [disabled]="form.invalid || saving()" (click)="submit()">
              <span *ngIf="saving()" class="loading loading-spinner loading-sm"></span>
              Create tenant
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" class="modal-backdrop"><button type="button" (click)="createOpen.set(false)">close</button></form>
    </dialog>
  `,
})
export class TenantsListComponent implements OnInit {
  private api = inject(AdminApiService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  tenants = signal<TenantSummary[]>([]);
  loading = signal(false);
  saving = signal(false);
  createOpen = signal(false);
  statuses = STATUSES;

  // Create wizard state
  step = signal(1);
  featureKeys = FEATURE_KEYS;
  labels = FEATURE_LABELS;
  featuresOn = signal<Record<string, boolean>>(this.allFeaturesOn());

  search = '';
  statusFilter = '';

  filtered = computed(() => {
    const q = this.search.trim().toLowerCase();
    return this.tenants().filter((t) => {
      if (this.statusFilter && t.status !== this.statusFilter) return false;
      if (!q) return true;
      return `${t.name} ${t.slug} ${t.email}`.toLowerCase().includes(q);
    });
  });

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    slug: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    adminFullName: ['', Validators.required],
    adminEmail: ['', [Validators.required, Validators.email]],
    adminPassword: ['', [Validators.required, Validators.minLength(8)]],
  });

  ngOnInit() {
    this.reload();
  }

  reload() {
    this.loading.set(true);
    this.api.listTenants().subscribe({
      next: (ts) => { this.tenants.set(ts); this.loading.set(false); },
      error: () => { this.toast.error('Could not load tenants'); this.loading.set(false); },
    });
  }

  private allFeaturesOn(): Record<string, boolean> {
    return Object.fromEntries(FEATURE_KEYS.map((k) => [k, true]));
  }

  openCreate() {
    this.form.reset({ name: '', slug: '', email: '', phone: '', adminFullName: '', adminEmail: '', adminPassword: '' });
    this.step.set(1);
    this.featuresOn.set(this.allFeaturesOn());
    this.createOpen.set(true);
  }

  toggleFeatureChoice(key: FeatureKey) {
    this.featuresOn.update((m) => ({ ...m, [key]: !m[key] }));
  }

  enabledFeatureLabels(): string {
    return FEATURE_KEYS.filter((k) => this.featuresOn()[k]).map((k) => FEATURE_LABELS[k]).join(', ');
  }

  /** Per-step validation so Next only advances when the current step is complete. */
  stepValid(step: number): boolean {
    const c = this.form.controls;
    if (step === 1) return c.name.valid && c.slug.valid && c.email.valid;
    if (step === 2) return c.adminFullName.valid && c.adminEmail.valid && c.adminPassword.valid;
    return true;
  }

  onNameInput() {
    // Auto-suggest a slug from the name only while the slug is still untouched/empty.
    if (this.form.controls.slug.dirty) return;
    const slug = this.form.controls.name.value.toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    this.form.patchValue({ slug });
  }

  submit() {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.api.createTenant(this.form.getRawValue() as CreateTenantPayload).subscribe({
      next: (t) => {
        // Tenants are created with all features on; disable the ones unchecked in the wizard.
        const toDisable = FEATURE_KEYS.filter((k) => !this.featuresOn()[k]);
        const tail: Observable<unknown> = toDisable.length
          ? forkJoin(toDisable.map((k) => this.api.toggleFeature(t.id, k, false)))
          : of(null);
        tail.subscribe({
          next: () => {
            this.toast.success(`Tenant "${t.name}" created`);
            this.createOpen.set(false);
            this.saving.set(false);
            this.reload();
          },
          error: () => {
            // Tenant exists; only the feature tweaks failed — surface but don't lose the tenant.
            this.toast.warning(`Tenant "${t.name}" created, but some features couldn't be set`);
            this.createOpen.set(false);
            this.saving.set(false);
            this.reload();
          },
        });
      },
      error: (err) => {
        const msg = err.error?.message ?? 'Could not create tenant';
        this.toast.error(Array.isArray(msg) ? msg.join(' · ') : msg);
        this.saving.set(false);
      },
    });
  }

  changeStatus(t: TenantSummary, status: TenantStatus) {
    const prev = t.status;
    this.api.setTenantStatus(t.id, status).subscribe({
      next: () => {
        this.tenants.update((arr) => arr.map((x) => (x.id === t.id ? { ...x, status } : x)));
        this.toast.success(`${t.name} → ${status}`);
      },
      error: () => {
        this.toast.error('Could not update status');
        this.tenants.update((arr) => arr.map((x) => (x.id === t.id ? { ...x, status: prev } : x)));
      },
    });
  }
}
