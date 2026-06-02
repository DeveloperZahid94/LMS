import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { HasFeatureDirective } from '../../shared/directives/has-feature.directive';
import { FeatureKey } from '@lms/shared';
import { BranchesApiService, Branch } from '../students/branches.service';

interface AttendanceRow {
  id: string; checkInAt: string; checkOutAt: string | null;
  source: string;
  checkInSelfieUrl?: string | null; checkInLat?: number | null; checkInLng?: number | null;
  checkOutSelfieUrl?: string | null; checkOutLat?: number | null; checkOutLng?: number | null;
  student: { id: string; code: string; fullName: string; phone: string };
}

@Component({
  selector: 'lms-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule, HasFeatureDirective],
  template: `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-bold">Attendance</h1>
      <input class="input input-bordered max-w-xs" type="date" [(ngModel)]="date" (ngModelChange)="reload()" />
    </div>

    <div class="card bg-base-100 border border-base-300 mb-4" *lmsHasFeature="FeatureKey.QR_ATTENDANCE">
      <div class="card-body py-4">
        <h3 class="card-title text-base">QR Check-in</h3>
        <p class="text-sm opacity-60">Paste a scanned QR token below. In production this is wired to a camera scanner component.</p>
        <div class="flex flex-wrap gap-2 mt-2">
          <input class="input input-bordered flex-1 min-w-[200px]" [(ngModel)]="qrCode" placeholder="QR token from student badge" />
          <select class="select select-bordered" [(ngModel)]="branchId">
            <option [ngValue]="null">— branch —</option>
            <option *ngFor="let b of branches()" [value]="b.id">{{ b.name }}</option>
          </select>
          <button class="btn btn-primary" (click)="checkIn()" [disabled]="!qrCode || !branchId">Check in</button>
        </div>
        <div *ngIf="status()" class="alert mt-2 py-2 text-sm" [class.alert-success]="!statusError()" [class.alert-error]="statusError()">
          {{ status() }}
        </div>
      </div>
    </div>

    <div class="card bg-base-100 border border-base-300 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="table table-zebra">
          <thead>
            <tr><th>Student</th><th>Phone</th><th>Check-in</th><th>Check-out</th><th>Selfie</th><th>Location</th><th>Source</th><th class="text-right">Actions</th></tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of rows()">
              <td><code class="text-xs bg-base-200 px-1.5 py-0.5 rounded">{{ r.student.code }}</code> {{ r.student.fullName }}</td>
              <td>{{ r.student.phone }}</td>
              <td>{{ r.checkInAt | date:'shortTime' }}</td>
              <td>{{ r.checkOutAt ? (r.checkOutAt | date:'shortTime') : '—' }}</td>
              <td>
                <div class="flex gap-1">
                  <img *ngIf="r.checkInSelfieUrl" [src]="r.checkInSelfieUrl" class="w-9 h-9 rounded object-cover cursor-pointer border border-base-300" title="Check-in selfie" (click)="lightbox.set(r.checkInSelfieUrl!)" />
                  <img *ngIf="r.checkOutSelfieUrl" [src]="r.checkOutSelfieUrl" class="w-9 h-9 rounded object-cover cursor-pointer border border-base-300" title="Check-out selfie" (click)="lightbox.set(r.checkOutSelfieUrl!)" />
                  <span *ngIf="!r.checkInSelfieUrl && !r.checkOutSelfieUrl" class="opacity-40 text-xs">—</span>
                </div>
              </td>
              <td class="text-xs">
                <a *ngIf="r.checkInLat != null" class="link link-primary" target="_blank"
                   [href]="'https://maps.google.com/?q=' + r.checkInLat + ',' + r.checkInLng">📍 in</a>
                <a *ngIf="r.checkOutLat != null" class="link link-primary ml-2" target="_blank"
                   [href]="'https://maps.google.com/?q=' + r.checkOutLat + ',' + r.checkOutLng">📍 out</a>
                <span *ngIf="r.checkInLat == null && r.checkOutLat == null" class="opacity-40">—</span>
              </td>
              <td><span class="badge badge-ghost">{{ r.source }}</span></td>
              <td class="text-right">
                <button class="btn btn-ghost btn-xs text-error" (click)="resetRow(r)" title="Delete this day's check-in/out so the student can check in again">Reset</button>
              </td>
            </tr>
            <tr *ngIf="rows().length === 0">
              <td colspan="8" class="text-center opacity-60 py-8">No check-ins for this date.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- selfie lightbox -->
    <div *ngIf="lightbox() as img" class="fixed inset-0 z-50 bg-black/80 grid place-items-center p-4 cursor-zoom-out" (click)="lightbox.set(null)">
      <img [src]="img" class="max-w-full max-h-full rounded-lg shadow-2xl" alt="selfie" />
    </div>
  `,
})
export class AttendanceComponent implements OnInit {
  private http = inject(HttpClient);
  private branchesApi = inject(BranchesApiService);
  FeatureKey = FeatureKey;

  date = new Date().toISOString().slice(0, 10);
  qrCode = '';
  branchId: string | null = null;
  branches = signal<Branch[]>([]);
  rows = signal<AttendanceRow[]>([]);
  status = signal<string | null>(null);
  statusError = signal(false);
  lightbox = signal<string | null>(null);

  ngOnInit() {
    this.branchesApi.list().subscribe((bs) => {
      this.branches.set(bs);
      if (bs.length === 1) this.branchId = bs[0].id;
    });
    this.reload();
  }

  reload() {
    this.http.get<AttendanceRow[]>(`${environment.apiUrl}/attendance?date=${this.date}`)
      .subscribe((rs) => this.rows.set(rs));
  }

  resetRow(r: AttendanceRow) {
    if (!confirm(`Reset attendance for ${r.student.fullName}? This deletes today's check-in/out so they can check in again.`)) return;
    this.http.delete(`${environment.apiUrl}/attendance/${r.id}`).subscribe({
      next: () => { this.status.set(`Attendance reset for ${r.student.fullName}`); this.statusError.set(false); this.reload(); },
      error: (err) => { this.status.set(err.error?.message ?? 'Reset failed'); this.statusError.set(true); },
    });
  }

  checkIn() {
    this.status.set(null); this.statusError.set(false);
    this.http.post(`${environment.apiUrl}/attendance/qr`, { qrCode: this.qrCode, branchId: this.branchId })
      .subscribe({
        next: () => {
          this.status.set('Checked in successfully');
          this.qrCode = '';
          this.reload();
        },
        error: (err) => {
          this.status.set(err.error?.message ?? 'Check-in failed');
          this.statusError.set(true);
        },
      });
  }
}
