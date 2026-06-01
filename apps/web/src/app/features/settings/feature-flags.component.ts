import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { FEATURE_LABELS, FeatureFlag } from '@lms/shared';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'lms-feature-flags',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="mb-4">
      <h1 class="text-2xl font-bold">Features</h1>
      <p class="text-sm opacity-60">
        {{ canEdit() ? 'Toggle features for the selected tenant.' : 'View the features enabled for your account.' }}
      </p>
    </div>

    <div class="card bg-base-100 border border-base-300 max-w-2xl">
      <div class="card-body p-0">
        <div *ngFor="let f of flags(); let last = last"
          class="flex items-center justify-between px-5 py-4"
          [class.border-b]="!last"
          [class.border-base-300]="!last">
          <div>
            <div class="font-medium">{{ labels[f.key] }}</div>
            <div class="text-xs opacity-60 font-mono">{{ f.key }}</div>
          </div>
          <input type="checkbox" class="toggle toggle-primary" [checked]="f.enabled" [disabled]="!canEdit()" (change)="toggle(f)" />
        </div>
        <div *ngIf="flags().length === 0" class="text-center opacity-60 p-6">
          No feature flags configured for this tenant.
        </div>
      </div>
    </div>
  `,
})
export class FeatureFlagsComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  flags = signal<FeatureFlag[]>([]);
  labels = FEATURE_LABELS;

  ngOnInit() {
    this.http.get<FeatureFlag[]>(`${environment.apiUrl}/feature-flags/me`)
      .subscribe((fs) => this.flags.set(fs));
  }

  canEdit(): boolean {
    return this.auth.user()?.role === 'SUPER_ADMIN';
  }

  toggle(f: FeatureFlag) {
    if (!this.canEdit()) return;
    const tenantId = this.auth.user()?.tenantId;
    if (!tenantId) return;
    this.http.put<FeatureFlag>(
      `${environment.apiUrl}/feature-flags/tenants/${tenantId}/${f.key}`,
      { enabled: !f.enabled },
    ).subscribe(() => {
      this.flags.update((arr) =>
        arr.map((x) => (x.key === f.key ? { ...x, enabled: !x.enabled } : x)),
      );
    });
  }
}
