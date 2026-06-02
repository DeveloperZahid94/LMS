import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Student } from '@lms/shared';
import { StudentsApiService } from './students.service';
import { PaymentsApiService, PaymentSummary } from '../payments/payments.service';
import { ToastService } from '../../core/services/toast.service';

type Tab = 'overview' | 'payments' | 'documents' | 'history' | 'biometric';

interface AttendanceRow {
  id: string;
  date: string;
  checkInAt: string;
  checkOutAt: string | null;
  source: string;
}

@Component({
  selector: 'lms-student-profile',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="max-w-6xl mx-auto">
      <!-- Header -->
      <div class="mb-4 flex items-center justify-between flex-wrap gap-2">
        <a routerLink="/students" class="link link-hover text-sm opacity-70">← Students</a>
        <div class="flex gap-2">
          <button class="btn btn-sm btn-outline" (click)="resetPassword()" [disabled]="resetting()">
            <span *ngIf="resetting()" class="loading loading-spinner loading-xs"></span>🔑 Reset password
          </button>
          <a class="btn btn-sm btn-primary" [routerLink]="['/students', id()]">✎ Edit</a>
        </div>
      </div>

      <div *ngIf="loading()" class="text-center py-16"><span class="loading loading-spinner loading-lg"></span></div>

      <ng-container *ngIf="!loading() && student() as s">
        <!-- Identity banner -->
        <div class="card bg-base-100 border border-base-300 shadow-sm mb-4">
          <div class="card-body p-5 flex-row items-center gap-4 flex-wrap">
            <button type="button" class="w-20 h-20 rounded-full overflow-hidden grid place-items-center shrink-0 border border-base-300 bg-base-200"
                    [disabled]="!s.photoUrl" (click)="s.photoUrl && lightbox.set(s.photoUrl)">
              <img *ngIf="s.photoUrl" [src]="s.photoUrl" class="w-full h-full object-cover" alt="photo" />
              <span *ngIf="!s.photoUrl" class="text-2xl font-bold opacity-50">{{ initials(s.fullName) }}</span>
            </button>
            <div class="min-w-0 flex-1">
              <h1 class="text-2xl font-bold flex items-center gap-2 flex-wrap">
                {{ s.fullName }}
                <span class="badge"
                  [class.badge-success]="s.status==='ACTIVE'"
                  [class.badge-info]="s.status==='PENDING'"
                  [class.badge-warning]="s.status==='SUSPENDED'"
                  [class.badge-ghost]="s.status==='INACTIVE'">{{ s.status | titlecase }}</span>
              </h1>
              <p class="text-sm opacity-60 mt-0.5">
                <code class="bg-base-200 px-1.5 py-0.5 rounded">{{ s.code }}</code>
                · {{ s.phone }}
              </p>
            </div>
          </div>
        </div>

        <!-- Tabs -->
        <div role="tablist" class="tabs tabs-boxed bg-base-200 mb-4 inline-flex">
          <a role="tab" class="tab" [class.tab-active]="tab()==='overview'" (click)="tab.set('overview')">Overview</a>
          <a role="tab" class="tab" [class.tab-active]="tab()==='payments'" (click)="tab.set('payments')">Payments</a>
          <a role="tab" class="tab" [class.tab-active]="tab()==='documents'" (click)="tab.set('documents')">Documents</a>
          <a role="tab" class="tab" [class.tab-active]="tab()==='history'" (click)="tab.set('history')">History</a>
          <a role="tab" class="tab" [class.tab-active]="tab()==='biometric'" (click)="tab.set('biometric')">Biometric</a>
        </div>

        <!-- ================= OVERVIEW ================= -->
        <div *ngIf="tab()==='overview'" class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <!-- Personal info -->
          <div class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body p-5">
              <div class="font-semibold flex items-center gap-2 mb-3"><span>👤</span> Personal Info</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div><div class="opacity-60 text-xs">Full Name</div><div class="font-medium">{{ s.fullName }}</div></div>
                <div><div class="opacity-60 text-xs">Phone</div><div class="font-medium">{{ s.phone }}</div></div>
                <div><div class="opacity-60 text-xs">Email</div><div class="font-medium truncate">{{ s.email || '—' }}</div></div>
                <div><div class="opacity-60 text-xs">Gender</div><div class="font-medium">{{ s.gender || '—' }}</div></div>
                <div><div class="opacity-60 text-xs">Date of birth</div><div class="font-medium">{{ (s.dateOfBirth | date:'mediumDate') || '—' }}</div></div>
                <div><div class="opacity-60 text-xs">Exam target</div><div class="font-medium">{{ s.examTarget || '—' }}</div></div>
                <div>
                  <div class="opacity-60 text-xs">Aadhaar</div>
                  <div class="font-medium flex items-center gap-2">
                    {{ s.aadhaarNumber ? (showAadhaar() ? s.aadhaarNumber : maskAadhaar(s.aadhaarNumber)) : '—' }}
                    <button *ngIf="s.aadhaarNumber" class="opacity-60 hover:opacity-100" (click)="showAadhaar.set(!showAadhaar())" title="Show/hide">👁</button>
                  </div>
                </div>
                <div><div class="opacity-60 text-xs">Voter ID</div><div class="font-medium">{{ s.voterId || '—' }}</div></div>
                <div><div class="opacity-60 text-xs">Father</div><div class="font-medium">{{ s.fatherName || '—' }}</div></div>
                <div><div class="opacity-60 text-xs">Mother</div><div class="font-medium">{{ s.motherName || '—' }}</div></div>
                <div><div class="opacity-60 text-xs">Emergency</div><div class="font-medium">{{ s.emergencyContact || '—' }}</div></div>
                <div class="sm:col-span-2"><div class="opacity-60 text-xs">Permanent address</div><div class="font-medium whitespace-pre-wrap">{{ s.permanentAddress || '—' }}</div></div>
              </div>
            </div>
          </div>

          <div class="space-y-4">
            <!-- Accommodation -->
            <div class="card bg-base-100 border border-base-300 shadow-sm">
              <div class="card-body p-5">
                <div class="font-semibold flex items-center gap-2 mb-3"><span>📍</span> Accommodation</div>
                <div *ngIf="summary()?.allocations?.length; else noAccom" class="space-y-3">
                  <div *ngFor="let a of summary()!.allocations" class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm border-b border-base-200 last:border-0 pb-3 last:pb-0">
                    <div><div class="opacity-60 text-xs">Type</div><div class="font-medium">{{ a.type === 'PG' ? 'PG Room' : 'Library Cabin' }}</div></div>
                    <div><div class="opacity-60 text-xs">Allocation</div><div class="font-medium text-primary">{{ a.label }}</div></div>
                    <div><div class="opacity-60 text-xs">Monthly rate</div><div class="font-medium">₹{{ a.monthlyRate | number }}</div></div>
                    <div><div class="opacity-60 text-xs">Paid until</div><div class="font-semibold">{{ a.nextDueDate ? (a.nextDueDate | date:'dd/MM/yyyy') : '—' }}</div></div>
                  </div>
                </div>
                <ng-template #noAccom><div class="text-sm opacity-50">No active allocation.</div></ng-template>
              </div>
            </div>

            <!-- Profile photo + live capture -->
            <div class="card bg-base-100 border border-base-300 shadow-sm">
              <div class="card-body p-5">
                <div class="font-semibold mb-3 text-center text-xs uppercase tracking-wider opacity-60">Profile Photo</div>
                <div class="flex flex-col items-center gap-3">
                  <div class="w-32 h-32 rounded-full overflow-hidden grid place-items-center border border-base-300 bg-base-200">
                    <img *ngIf="student()?.photoUrl" [src]="student()!.photoUrl!" class="w-full h-full object-cover" alt="photo" />
                    <span *ngIf="!student()?.photoUrl" class="text-3xl opacity-30">📷</span>
                  </div>
                  <div class="join">
                    <button type="button" class="join-item btn btn-sm" (click)="photoInput.click()">⬆ Upload</button>
                    <button type="button" class="join-item btn btn-sm btn-primary" (click)="openWebcam()">📷 Live Capture</button>
                  </div>
                  <input #photoInput type="file" accept="image/*" class="hidden" (change)="onPhotoPick($event)" />
                  <span *ngIf="savingPhoto()" class="loading loading-spinner loading-sm"></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ================= PAYMENTS ================= -->
        <div *ngIf="tab()==='payments'">
          <div *ngIf="summary() as sum">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div class="card bg-base-100 border border-base-300 p-3"><div class="text-[10px] uppercase tracking-wider opacity-60">Monthly fee</div><div class="text-lg font-bold">₹{{ sum.monthlyTotal | number }}</div></div>
              <div class="card bg-base-100 border border-base-300 p-3"><div class="text-[10px] uppercase tracking-wider opacity-60">Total paid</div><div class="text-lg font-bold text-success">₹{{ sum.totalPaid | number }}</div></div>
              <div class="card bg-base-100 border border-base-300 p-3"><div class="text-[10px] uppercase tracking-wider opacity-60">Payments</div><div class="text-lg font-bold">{{ sum.payments.length }}</div></div>
              <div class="card bg-base-100 border border-base-300 p-3"><div class="text-[10px] uppercase tracking-wider opacity-60">Last payment</div><div class="text-sm font-bold">{{ sum.payments[0] ? (sum.payments[0].paidAt || sum.payments[0].createdAt | date:'dd MMM yy') : '—' }}</div></div>
            </div>
            <div class="card bg-base-100 border border-base-300 shadow-sm overflow-hidden">
              <div class="overflow-x-auto">
                <table class="table table-sm">
                  <thead class="bg-base-200"><tr><th>Date</th><th class="text-right">Amount</th><th>Method</th><th>Status</th><th>Notes</th></tr></thead>
                  <tbody>
                    <tr *ngFor="let p of sum.payments" class="hover">
                      <td class="text-xs">{{ (p.paidAt || p.createdAt) | date:'dd MMM yy, HH:mm' }}</td>
                      <td class="text-right font-medium">₹{{ p.amount | number }}</td>
                      <td><span class="badge badge-ghost badge-sm">{{ p.method }}</span></td>
                      <td><span class="badge badge-sm" [class.badge-success]="p.status==='PAID'" [class.badge-warning]="p.status==='PENDING'" [class.badge-error]="p.status==='FAILED'">{{ p.status }}</span></td>
                      <td class="text-xs opacity-70 max-w-[200px] truncate" [title]="p.notes ?? ''">{{ p.notes || '—' }}</td>
                    </tr>
                    <tr *ngIf="sum.payments.length === 0"><td colspan="5" class="text-center opacity-60 py-8">No payments recorded yet.</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- ================= DOCUMENTS ================= -->
        <div *ngIf="tab()==='documents'" class="card bg-base-100 border border-base-300 shadow-sm">
          <div class="card-body p-5">
            <div class="font-semibold mb-3">Uploaded Documents &amp; Photo</div>
            <div *ngIf="documentList().length > 0; else noDocs" class="flex flex-wrap gap-4">
              <button type="button" *ngFor="let d of documentList()" class="group text-center" (click)="lightbox.set(d.url)">
                <div class="w-32 h-32 rounded-lg border border-base-300 overflow-hidden bg-base-200 group-hover:border-primary transition-colors">
                  <img [src]="d.url" class="w-full h-full object-cover" [alt]="d.label" />
                </div>
                <div class="text-xs opacity-70 mt-1 w-32 truncate">{{ d.label }}</div>
              </button>
            </div>
            <ng-template #noDocs><div class="text-sm opacity-50">No photo or documents uploaded. Use Edit to add them.</div></ng-template>
          </div>
        </div>

        <!-- ================= HISTORY ================= -->
        <div *ngIf="tab()==='history'" class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <div class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body p-5">
              <div class="font-semibold flex items-center gap-2 mb-3"><span>✓</span> Attendance</div>
              <div class="overflow-x-auto max-h-96">
                <table class="table table-sm table-pin-rows">
                  <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Source</th></tr></thead>
                  <tbody>
                    <tr *ngFor="let a of attendance()" class="hover">
                      <td class="text-xs">{{ a.date | date:'dd MMM yy' }}</td>
                      <td class="text-xs">{{ a.checkInAt | date:'HH:mm' }}</td>
                      <td class="text-xs">{{ a.checkOutAt ? (a.checkOutAt | date:'HH:mm') : '—' }}</td>
                      <td><span class="badge badge-ghost badge-xs">{{ a.source }}</span></td>
                    </tr>
                    <tr *ngIf="attendance().length === 0"><td colspan="4" class="text-center opacity-60 py-6">No attendance records.</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body p-5">
              <div class="font-semibold flex items-center gap-2 mb-3"><span>₹</span> Payment history</div>
              <div class="overflow-x-auto max-h-96">
                <table class="table table-sm table-pin-rows">
                  <thead><tr><th>Date</th><th class="text-right">Amount</th><th>Method</th></tr></thead>
                  <tbody>
                    <tr *ngFor="let p of summary()?.payments || []" class="hover">
                      <td class="text-xs">{{ (p.paidAt || p.createdAt) | date:'dd MMM yy' }}</td>
                      <td class="text-right font-medium">₹{{ p.amount | number }}</td>
                      <td><span class="badge badge-ghost badge-xs">{{ p.method }}</span></td>
                    </tr>
                    <tr *ngIf="(summary()?.payments || []).length === 0"><td colspan="3" class="text-center opacity-60 py-6">No payments.</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- ================= BIOMETRIC ================= -->
        <div *ngIf="tab()==='biometric'" class="card bg-base-100 border border-base-300 shadow-sm max-w-xl">
          <div class="card-body p-5">
            <div class="font-semibold flex items-center gap-2 mb-3"><span>🔒</span> Biometric Enrollment</div>
            <div class="alert mb-3 py-2">
              <span class="inline-block w-2 h-2 rounded-full bg-warning"></span>
              <span class="text-sm"><strong>Not enrolled.</strong> This student has no fingerprint registered yet.</span>
            </div>
            <p class="text-sm opacity-70 mb-3">
              Fingerprint enrollment uses the Secureye device configured under
              <a routerLink="/settings" class="link link-primary">Settings → Biometric Device</a>.
            </p>
            <button type="button" class="btn btn-primary btn-sm" (click)="comingSoon()">Enroll fingerprint</button>
          </div>
        </div>
      </ng-container>
    </div>

    <!-- Webcam modal -->
    <dialog class="modal" [class.modal-open]="webcamOpen()">
      <div class="modal-box max-w-lg">
        <h3 class="font-bold text-lg mb-2">Capture profile photo</h3>
        <div class="rounded-lg overflow-hidden bg-black grid place-items-center aspect-video">
          <video #webcamVideo autoplay playsinline muted class="w-full h-full object-contain"></video>
        </div>
        <div class="modal-action">
          <button type="button" class="btn btn-ghost" (click)="closeWebcam()">Cancel</button>
          <button type="button" class="btn btn-primary" (click)="capturePhoto()">📸 Capture &amp; Save</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button type="button" (click)="closeWebcam()">close</button></form>
    </dialog>

    <!-- Lightbox -->
    <div *ngIf="lightbox() as img" class="fixed inset-0 z-[60] bg-black/80 grid place-items-center p-4 cursor-zoom-out" (click)="lightbox.set(null)">
      <img [src]="img" class="max-w-full max-h-full rounded-lg shadow-2xl" alt="preview" />
    </div>

    <!-- Reset-password result -->
    <dialog class="modal" [class.modal-open]="!!resetResult()">
      <div class="modal-box" *ngIf="resetResult() as r">
        <h3 class="font-bold text-lg">Temporary password</h3>
        <p class="py-2 text-sm opacity-70">
          Share this with the student. They sign in at the check-in kiosk with their
          <strong>student code</strong> + this password, and will be asked to set a new one. Won't be shown again.
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
export class StudentProfileComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(StudentsApiService);
  private paymentsApi = inject(PaymentsApiService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);

  @ViewChild('webcamVideo') webcamVideo?: ElementRef<HTMLVideoElement>;

  id = signal<string>('');
  loading = signal(true);
  student = signal<Student | null>(null);
  summary = signal<PaymentSummary | null>(null);
  attendance = signal<AttendanceRow[]>([]);

  tab = signal<Tab>('overview');
  showAadhaar = signal(false);
  lightbox = signal<string | null>(null);
  resetting = signal(false);
  resetResult = signal<{ studentId: string; tempPassword: string } | null>(null);
  savingPhoto = signal(false);
  webcamOpen = signal(false);
  private mediaStream: MediaStream | null = null;

  documentList = computed(() => {
    const s: any = this.student();
    if (!s) return [];
    return [
      { label: 'Photo', url: s.photoUrl },
      { label: 'Aadhaar Front', url: s.aadhaarFrontUrl },
      { label: 'Aadhaar Back', url: s.aadhaarBackUrl },
      { label: 'Voter ID', url: s.voterIdUrl },
      { label: 'ID Proof', url: s.idProofUrl },
    ].filter((d): d is { label: string; url: string } => !!d.url);
  });

  ngOnInit() {
    this.id.set(this.route.snapshot.paramMap.get('id') ?? '');
    this.api.get(this.id()).subscribe({
      next: (s) => { this.student.set(s); this.loading.set(false); },
      error: () => { this.toast.error('Could not load student'); this.loading.set(false); },
    });
    this.paymentsApi.studentSummary(this.id()).subscribe({
      next: (sum) => this.summary.set(sum),
      error: () => undefined,
    });
    this.http.get<AttendanceRow[]>(`${environment.apiUrl}/attendance/students/${this.id()}`).subscribe({
      next: (rows) => this.attendance.set(rows),
      error: () => undefined,
    });
  }

  initials(name: string): string {
    return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  }
  maskAadhaar(a: string): string {
    return a.length >= 4 ? `XXXX-XXXX-${a.slice(-4)}` : 'XXXX';
  }
  comingSoon() {
    this.toast.info('Biometric enrollment — integration coming soon. Contact Support to enable.');
  }

  resetPassword() {
    this.resetting.set(true);
    this.api.resetPassword(this.id()).subscribe({
      next: (r) => { this.resetResult.set(r); this.resetting.set(false); },
      error: () => { this.toast.error('Could not reset password'); this.resetting.set(false); },
    });
  }

  copy(text: string) {
    navigator.clipboard?.writeText(text).then(
      () => this.toast.success('Copied'),
      () => this.toast.error('Copy failed'),
    );
  }

  // ---- Photo update ----
  onPhotoPick(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { this.toast.error('Please choose an image'); input.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => this.downscale(reader.result as string, 640).then((url) => this.savePhoto(url));
    reader.onerror = () => this.toast.error('Could not read image');
    reader.readAsDataURL(file);
    input.value = '';
  }

  private savePhoto(dataUrl: string) {
    this.savingPhoto.set(true);
    this.api.update(this.id(), { photoUrl: dataUrl } as any).subscribe({
      next: (s) => { this.student.set(s); this.savingPhoto.set(false); this.toast.success('Photo updated'); },
      error: () => { this.savingPhoto.set(false); this.toast.error('Could not save photo'); },
    });
  }

  private downscale(dataUrl: string, maxDim: number): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
        else if (height >= width && height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(dataUrl); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  async openWebcam() {
    if (!navigator.mediaDevices?.getUserMedia) { this.toast.error('Camera not supported'); return; }
    this.webcamOpen.set(true);
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      setTimeout(() => {
        const v = this.webcamVideo?.nativeElement;
        if (v && this.mediaStream) { v.srcObject = this.mediaStream; v.play().catch(() => undefined); }
      }, 50);
    } catch {
      this.toast.error('Could not access the camera. Check permissions.');
      this.webcamOpen.set(false);
    }
  }
  capturePhoto() {
    const video = this.webcamVideo?.nativeElement;
    if (!video || !video.videoWidth) { this.toast.warning('Camera still starting — try again.'); return; }
    const maxDim = 640;
    let w = video.videoWidth, h = video.videoHeight;
    if (w > h && w > maxDim) { h = Math.round((h * maxDim) / w); w = maxDim; }
    else if (h >= w && h > maxDim) { w = Math.round((w * maxDim) / h); h = maxDim; }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')?.drawImage(video, 0, 0, w, h);
    const url = canvas.toDataURL('image/jpeg', 0.78);
    this.closeWebcam();
    this.savePhoto(url);
  }
  closeWebcam() {
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.mediaStream = null;
    this.webcamOpen.set(false);
  }
  ngOnDestroy() { this.closeWebcam(); }
}
