import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import { ToastContainerComponent } from '../../shared/components/toast-container.component';

interface SelfAttendance {
  id: string;
  checkInAt: string;
  checkOutAt: string | null;
}
interface Allocation {
  type: 'SEAT' | 'PG';
  label: string;
  monthlyRate: number;
  nextDueDate: string | null;
  status: string; // CONFIRMED | TEMPORARY | ACTIVE
}
interface TodayResponse {
  student: { id: string; code: string; fullName: string; photoUrl: string | null };
  attendance: SelfAttendance | null;
  allocations: Allocation[];
  nextDueDate: string | null;
  expiresAt: string | null;
  totalPaid: number;
  monthlyTotal: number;
  balance: number;
  confirmed: boolean;
}

@Component({
  selector: 'lms-checkin',
  standalone: true,
  imports: [CommonModule, FormsModule, ToastContainerComponent],
  template: `
    <lms-toast-container />
    <div [attr.data-theme]="theme.theme()" class="min-h-screen bg-base-200 flex flex-col">
      <!-- top bar -->
      <div class="navbar bg-base-100 border-b border-base-300 px-4">
        <div class="flex-1 font-semibold">{{ tenantName() }} · Check-In</div>
        <button class="btn btn-ghost btn-sm btn-circle" (click)="load()" title="Refresh">⟳</button>
        <button class="btn btn-ghost btn-sm btn-circle" (click)="theme.toggle()" [title]="theme.isDark() ? 'Light mode' : 'Dark mode'">
          <span *ngIf="theme.isDark()">☀</span>
          <span *ngIf="!theme.isDark()">☾</span>
        </button>
        <button class="btn btn-ghost btn-sm" (click)="openChangePw()">🔑 Password</button>
        <button class="btn btn-ghost btn-sm" (click)="logout()">Sign out ⤴</button>
      </div>

      <!-- Payment reminder marquee -->
      <div *ngIf="reminder() as rm" class="marquee py-2 text-sm font-medium"
           [class.bg-error]="rm.level === 'overdue'" [class.text-error-content]="rm.level === 'overdue'"
           [class.bg-warning]="rm.level !== 'overdue'" [class.text-warning-content]="rm.level !== 'overdue'">
        <span>🔔 {{ rm.text }} &nbsp;•&nbsp; {{ rm.text }} &nbsp;•&nbsp; {{ rm.text }}</span>
      </div>

      <div class="flex-1 grid place-items-center p-4">
        <div class="card bg-base-100 shadow-xl w-full max-w-md">
          <div class="card-body items-center text-center" *ngIf="today() as t">
            <!-- avatar -->
            <div class="w-24 h-24 rounded-full overflow-hidden grid place-items-center border border-base-300 bg-base-200 mb-1">
              <img *ngIf="t.student.photoUrl" [src]="t.student.photoUrl" class="w-full h-full object-cover" alt="photo" />
              <span *ngIf="!t.student.photoUrl" class="text-2xl font-bold opacity-40">{{ initials(t.student.fullName) }}</span>
            </div>
            <h2 class="text-xl font-bold">{{ t.student.fullName }}</h2>
            <p class="text-sm opacity-60">{{ t.student.code }} · {{ now() | date:'EEE, dd MMM yyyy' }}</p>

            <!-- status -->
            <div class="w-full mt-3 rounded-xl p-4"
                 [class.bg-base-200]="!t.attendance"
                 [class.bg-success]="!!t.attendance && !t.attendance.checkOutAt" [class.bg-opacity-10]="!!t.attendance"
                 [class.bg-neutral]="!!t.attendance?.checkOutAt">
              <ng-container *ngIf="!t.attendance">
                <div class="text-sm opacity-70">You haven't checked in today.</div>
              </ng-container>
              <ng-container *ngIf="t.attendance as a">
                <div class="text-sm">Checked in at <strong>{{ a.checkInAt | date:'shortTime' }}</strong></div>
                <div class="text-sm" *ngIf="a.checkOutAt">Checked out at <strong>{{ a.checkOutAt | date:'shortTime' }}</strong></div>
                <div class="text-xs opacity-60 mt-1" *ngIf="!a.checkOutAt">You're currently checked in.</div>
                <div class="text-xs opacity-60 mt-1" *ngIf="a.checkOutAt">Done for today — see you next time! 👋</div>
              </ng-container>
            </div>

            <!-- Payments & status -->
            <div class="grid grid-cols-3 gap-2 w-full mt-3">
              <div class="rounded-lg bg-base-200 p-2">
                <div class="text-[10px] uppercase tracking-wider opacity-60">Total Paid</div>
                <div class="font-bold">₹{{ t.totalPaid | number }}</div>
              </div>
              <div class="rounded-lg bg-base-200 p-2">
                <div class="text-[10px] uppercase tracking-wider opacity-60">Balance</div>
                <div class="font-bold" [class.text-error]="t.balance > 0">₹{{ t.balance | number }}</div>
              </div>
              <div class="rounded-lg bg-base-200 p-2">
                <div class="text-[10px] uppercase tracking-wider opacity-60">Status</div>
                <div class="font-bold text-sm" [class.text-success]="t.confirmed" [class.text-warning]="!t.confirmed">
                  {{ t.confirmed ? 'Confirmed' : 'Pending' }}
                </div>
              </div>
            </div>

            <!-- actions: both always visible; the completed one is disabled, and resets next day -->
            <div class="grid grid-cols-2 gap-3 w-full mt-4">
              <button class="btn btn-primary btn-lg" (click)="start('in')" [disabled]="busy() || !!t.attendance">
                <span *ngIf="busy() && pendingAction()==='in'" class="loading loading-spinner loading-sm"></span>
                {{ t.attendance ? '✓ Checked In' : '📸 Check In' }}
              </button>
              <button class="btn btn-warning btn-lg" (click)="start('out')" [disabled]="busy() || !t.attendance || !!t.attendance.checkOutAt">
                <span *ngIf="busy() && pendingAction()==='out'" class="loading loading-spinner loading-sm"></span>
                {{ t.attendance?.checkOutAt ? '✓ Checked Out' : '📸 Check Out' }}
              </button>
            </div>

            <p class="text-[11px] opacity-50 mt-3">A selfie and your location are captured for verification. Resets daily.</p>

            <!-- Allotment details -->
            <div class="w-full mt-4 text-left">
              <div class="text-xs uppercase tracking-wider opacity-60 font-semibold mb-2 text-center">Your Allotment</div>
              <div class="space-y-2">
                <div *ngFor="let a of t.allocations" class="flex items-center justify-between rounded-lg bg-base-200 px-3 py-2">
                  <div class="min-w-0">
                    <div class="text-sm font-medium truncate flex items-center gap-1.5">
                      {{ a.label }}
                      <span class="badge badge-xs"
                            [class.badge-success]="a.status==='CONFIRMED' || a.status==='ACTIVE'"
                            [class.badge-warning]="a.status==='TEMPORARY'">{{ a.status | titlecase }}</span>
                    </div>
                    <div class="text-[11px] opacity-60">{{ a.type === 'PG' ? 'PG Room' : 'Library Cabin' }} · ₹{{ a.monthlyRate | number }}/mo</div>
                  </div>
                  <div class="text-right text-xs shrink-0 ml-2">
                    <div class="opacity-60">Next due</div>
                    <div class="font-semibold" [class.text-error]="isOverdue(a.nextDueDate)">{{ a.nextDueDate ? (a.nextDueDate | date:'dd MMM') : '—' }}</div>
                  </div>
                </div>
                <div *ngIf="t.allocations.length === 0" class="text-sm opacity-50 text-center py-2">No active allotment yet.</div>
              </div>
              <div *ngIf="t.expiresAt" class="text-[11px] opacity-60 text-center mt-2">Membership valid till {{ t.expiresAt | date:'dd MMM yyyy' }}</div>
            </div>
          </div>
          <div class="card-body items-center" *ngIf="!today()">
            <span class="loading loading-spinner loading-lg"></span>
          </div>
        </div>
      </div>
    </div>

    <!-- Webcam capture modal -->
    <dialog [attr.data-theme]="theme.theme()" class="modal" [class.modal-open]="webcamOpen()">
      <div class="modal-box max-w-md">
        <h3 class="font-bold text-lg mb-2">{{ pendingAction() === 'in' ? 'Check-in' : 'Check-out' }} selfie</h3>
        <div class="rounded-lg overflow-hidden bg-black grid place-items-center aspect-video">
          <video #webcamVideo autoplay playsinline muted class="w-full h-full object-contain"></video>
        </div>
        <div class="modal-action">
          <button type="button" class="btn btn-ghost" (click)="cancel()">Cancel</button>
          <button type="button" class="btn btn-primary" (click)="capture()">📸 Capture &amp; Submit</button>
        </div>
      </div>
    </dialog>

    <!-- Change password modal -->
    <dialog [attr.data-theme]="theme.theme()" class="modal" [class.modal-open]="pwOpen()">
      <div class="modal-box max-w-sm">
        <h3 class="font-bold text-lg">Change password</h3>
        <p class="text-sm opacity-60" *ngIf="forcedPw()">An admin reset your password — set a new one to continue.</p>
        <div class="space-y-3 mt-3">
          <input class="input input-bordered w-full" type="password" [(ngModel)]="pwCurrent" placeholder="Current password (or phone)" autocomplete="current-password" />
          <input class="input input-bordered w-full" type="password" [(ngModel)]="pwNew" placeholder="New password (min 6 chars)" autocomplete="new-password" />
          <input class="input input-bordered w-full" type="password" [(ngModel)]="pwConfirm" placeholder="Confirm new password" autocomplete="new-password" />
        </div>
        <div class="modal-action">
          <button type="button" class="btn btn-ghost" (click)="pwOpen.set(false)" [disabled]="forcedPw()">Cancel</button>
          <button type="button" class="btn btn-primary" (click)="submitChangePw()" [disabled]="pwSaving()">
            <span *ngIf="pwSaving()" class="loading loading-spinner loading-sm"></span>
            Update password
          </button>
        </div>
      </div>
    </dialog>
  `,
  styles: [`
    .marquee { overflow: hidden; white-space: nowrap; }
    .marquee > span { display: inline-block; padding-left: 100%; animation: lms-marquee 16s linear infinite; }
    @keyframes lms-marquee { from { transform: translateX(0); } to { transform: translateX(-100%); } }
  `],
})
export class CheckinComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);
  theme = inject(ThemeService);

  @ViewChild('webcamVideo') webcamVideo?: ElementRef<HTMLVideoElement>;

  today = signal<TodayResponse | null>(null);
  busy = signal(false);
  webcamOpen = signal(false);
  pendingAction = signal<'in' | 'out'>('in');
  now = signal(new Date());
  private mediaStream: MediaStream | null = null;

  // Change password
  pwOpen = signal(false);
  pwSaving = signal(false);
  pwCurrent = '';
  pwNew = '';
  pwConfirm = '';
  forcedPw = computed(() => !!this.auth.user()?.mustChangePassword);

  /** Payment reminder banner derived from the earliest allocation due date. */
  reminder = computed<{ level: 'overdue' | 'due' | 'soon'; text: string } | null>(() => {
    const t = this.today();
    if (!t?.nextDueDate) return null;
    const due = new Date(t.nextDueDate);
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const days = Math.round((new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() - startOfToday.getTime()) / 86400000);
    if (days < 0) return { level: 'overdue', text: `Payment overdue by ${-days} day${-days === 1 ? '' : 's'} — please clear your dues at the desk` };
    if (days === 0) return { level: 'due', text: 'Payment due today — please pay at the desk' };
    if (days <= 7) return { level: 'soon', text: `Payment due in ${days} day${days === 1 ? '' : 's'}` };
    return null;
  });

  isOverdue(d: string | null): boolean {
    if (!d) return false;
    const due = new Date(d); const today = new Date(); today.setHours(0, 0, 0, 0);
    return new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() < today.getTime();
  }

  tenantName = computed(() => {
    const slug = this.auth.user()?.tenantSlug ?? '';
    return slug ? slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Library';
  });

  private pollHandle?: ReturnType<typeof setInterval>;
  private onVisible = () => { if (document.visibilityState === 'visible') this.load(); };

  ngOnInit() {
    this.load();
    // If an admin reset their password, force the change before they can use the kiosk.
    if (this.auth.user()?.mustChangePassword) this.pwOpen.set(true);
    // Keep payment/allocation status live: poll, and refresh when the tab regains focus.
    this.pollHandle = setInterval(() => this.load(), 30_000);
    document.addEventListener('visibilitychange', this.onVisible);
  }

  openChangePw() {
    this.pwCurrent = this.pwNew = this.pwConfirm = '';
    this.pwOpen.set(true);
  }

  submitChangePw() {
    if (!this.pwNew || this.pwNew.length < 6) { this.toast.error('New password must be at least 6 characters'); return; }
    if (this.pwNew !== this.pwConfirm) { this.toast.error('Passwords do not match'); return; }
    this.pwSaving.set(true);
    this.auth.studentChangePassword(this.pwCurrent, this.pwNew).subscribe({
      next: () => {
        this.auth.updateUser({ mustChangePassword: false });
        this.pwOpen.set(false);
        this.pwSaving.set(false);
        this.pwCurrent = this.pwNew = this.pwConfirm = '';
        this.toast.success('Password changed');
      },
      error: (err) => {
        this.toast.error(err.error?.message ?? 'Could not change password');
        this.pwSaving.set(false);
      },
    });
  }

  load() {
    this.http.get<TodayResponse>(`${environment.apiUrl}/my-attendance/today`).subscribe({
      next: (r) => this.today.set(r),
      error: () => { if (!this.today()) this.toast.error('Could not load your status'); },
    });
  }

  initials(name: string): string {
    return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  }

  async start(kind: 'in' | 'out') {
    if (!this.today()?.confirmed) {
      this.toast.warning('No allocation confirmed as of now. Please contact the desk.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) { this.toast.error('Camera not supported on this device'); return; }
    this.pendingAction.set(kind);
    this.webcamOpen.set(true);
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      setTimeout(() => {
        const v = this.webcamVideo?.nativeElement;
        if (v && this.mediaStream) { v.srcObject = this.mediaStream; v.play().catch(() => undefined); }
      }, 50);
    } catch {
      this.toast.error('Could not access the camera. Please allow camera access.');
      this.webcamOpen.set(false);
    }
  }

  cancel() {
    this.stopStream();
    this.webcamOpen.set(false);
  }

  capture() {
    const video = this.webcamVideo?.nativeElement;
    if (!video || !video.videoWidth) { this.toast.warning('Camera still starting — try again.'); return; }
    const maxDim = 600;
    let w = video.videoWidth, h = video.videoHeight;
    if (w > h && w > maxDim) { h = Math.round((h * maxDim) / w); w = maxDim; }
    else if (h >= w && h > maxDim) { w = Math.round((w * maxDim) / h); h = maxDim; }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')?.drawImage(video, 0, 0, w, h);
    const selfie = canvas.toDataURL('image/jpeg', 0.7);
    this.cancel();
    this.submit(selfie);
  }

  private getLocation(): Promise<{ lat?: number; lng?: number }> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({});
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve({}),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
      );
    });
  }

  private async submit(selfie: string) {
    this.busy.set(true);
    const loc = await this.getLocation();
    const kind = this.pendingAction();
    this.http.post(`${environment.apiUrl}/my-attendance/check-${kind}`, { ...loc, selfie }).subscribe({
      next: () => {
        this.toast.success(kind === 'in' ? 'Checked in — have a great session!' : 'Checked out — see you next time!');
        this.busy.set(false);
        this.load();
      },
      error: (err) => {
        this.toast.error(err.error?.message ?? 'Could not record attendance');
        this.busy.set(false);
      },
    });
  }

  private stopStream() {
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.mediaStream = null;
  }

  logout() { this.auth.logout(); this.router.navigate(['/student-login']); }
  ngOnDestroy() {
    this.stopStream();
    if (this.pollHandle) clearInterval(this.pollHandle);
    document.removeEventListener('visibilitychange', this.onVisible);
  }
}
