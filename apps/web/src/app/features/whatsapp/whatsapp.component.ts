import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { StudentsApiService, StudentRow } from '../students/students.service';
import { AlertsApiService, AlertsResponse } from '../alerts/alerts.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/services/auth.service';

type Audience = 'all' | 'dueSoon' | 'overdue';
type TemplateKey = 'reminder7' | 'dueToday' | 'overdue' | 'custom';

interface Recipient {
  id: string;
  fullName: string;
  code: string;
  phone: string;
  cabin: string;       // seat code or room number (whichever is set)
  amount: number;      // monthly fee
  dueDate: string;     // ISO string or empty
  isOverdue: boolean;
  daysFromDue: number; // negative = overdue
}

const LS_KEY_TEMPLATES = 'lms.whatsapp.templates';
const LS_KEY_SETTINGS  = 'lms.whatsapp.settings';

const DEFAULT_TEMPLATES: Record<Exclude<TemplateKey, 'custom'>, string> = {
  reminder7: `Dear {name},

This is a friendly reminder that your payment of ₹{amount} for {cabin} is due on {duedate}.

Please make the payment at the office or contact us at {phone}.

Thank you,
{pgname}`,
  dueToday: `Hi {name},

Your payment of ₹{amount} for {cabin} is due today ({duedate}).

Please visit the office today to clear your dues. For any queries, call {phone}.

Thank you,
{pgname}`,
  overdue: `Dear {name},

Your payment of ₹{amount} for {cabin} was due on {duedate} and is now overdue.

Kindly settle your account at the earliest. Contact us at {phone}.

Thank you,
{pgname}`,
};

@Component({
  selector: 'lms-whatsapp',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- ============================== HEADER ============================== -->
    <div class="flex items-end justify-between mb-4 flex-wrap gap-2">
      <div>
        <h1 class="text-2xl font-bold">WhatsApp Quick Send</h1>
        <p class="text-sm opacity-60 mt-1">Send pre-written messages to students via WhatsApp</p>
      </div>
      <div class="badge badge-success gap-2 p-3">
        <span>💬</span>
        <span class="text-xs font-semibold">wa.me Integration</span>
      </div>
    </div>

    <!-- Info banner -->
    <div class="alert mb-4">
      <span class="text-xl">ⓘ</span>
      <div>
        <div class="font-semibold">Using WhatsApp for reminders until SMS is configured ✓</div>
        <div class="text-sm opacity-80">This opens WhatsApp on your device with the message ready to send. No API required — completely free.</div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- ============================== LEFT: TEMPLATES + EDITOR ============================== -->
      <div class="card bg-base-100 border border-base-300 shadow-sm">
        <div class="card-body p-5">
          <div class="font-bold text-lg">Message Templates</div>
          <div class="text-xs opacity-60 mb-3">Click a template to select it then edit the message below</div>

          <div class="flex flex-wrap gap-2 mb-4">
            <button type="button" class="btn btn-sm"
                    [class.btn-primary]="activeTemplate() === 'reminder7'"
                    [class.btn-outline]="activeTemplate() !== 'reminder7'"
                    (click)="pickTemplate('reminder7')">7-Day Reminder</button>
            <button type="button" class="btn btn-sm"
                    [class.btn-primary]="activeTemplate() === 'dueToday'"
                    [class.btn-outline]="activeTemplate() !== 'dueToday'"
                    (click)="pickTemplate('dueToday')">Due Today</button>
            <button type="button" class="btn btn-sm"
                    [class.btn-primary]="activeTemplate() === 'overdue'"
                    [class.btn-outline]="activeTemplate() !== 'overdue'"
                    (click)="pickTemplate('overdue')">Overdue Alert</button>
            <button type="button" class="btn btn-sm"
                    [class.btn-primary]="activeTemplate() === 'custom'"
                    [class.btn-outline]="activeTemplate() !== 'custom'"
                    (click)="pickTemplate('custom')">Custom Message</button>
          </div>

          <div class="mb-3">
            <div class="text-[10px] uppercase tracking-wider opacity-60 font-semibold mb-1.5">Available variables:</div>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-1 text-xs">
              <div *ngFor="let v of variables" class="flex items-center gap-1.5 p-1.5 rounded bg-base-200">
                <code class="bg-base-100 px-1.5 rounded text-[11px]">{{ v.token }}</code>
                <span class="opacity-70">= {{ v.label }}</span>
              </div>
            </div>
          </div>

          <textarea class="textarea textarea-bordered w-full font-mono text-sm leading-relaxed"
                    rows="11"
                    [ngModel]="messageText()"
                    (ngModelChange)="onMessageChange($event)"></textarea>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
            <label class="form-control">
              <div class="label py-1"><span class="label-text text-xs">Your business name</span></div>
              <input class="input input-bordered input-sm"
                     [ngModel]="senderName()" (ngModelChange)="setSenderName($event)" />
            </label>
            <label class="form-control">
              <div class="label py-1"><span class="label-text text-xs">Reply contact phone</span></div>
              <input class="input input-bordered input-sm"
                     [ngModel]="replyPhone()" (ngModelChange)="setReplyPhone($event)"
                     placeholder="+91xxxxxxxxxx" />
            </label>
          </div>

          <div class="flex items-center justify-between mt-3 text-xs">
            <span class="opacity-60" *ngIf="dirty()">Unsaved edits to this template (auto-saved on send)</span>
            <button type="button" class="btn btn-ghost btn-xs ml-auto"
                    (click)="resetTemplate()">Reset to default</button>
          </div>
        </div>
      </div>

      <!-- ============================== RIGHT: STUDENT LIST ============================== -->
      <div class="card bg-base-100 border border-base-300 shadow-sm">
        <div class="card-body p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="font-bold text-lg">Send to Students</div>
            <div class="text-xs opacity-60" *ngIf="audience() !== 'all'">
              <span class="text-error" *ngIf="audience() === 'overdue'">{{ filteredRecipients().length }} overdue</span>
              <span class="text-warning" *ngIf="audience() === 'dueSoon'">{{ filteredRecipients().length }} due soon</span>
            </div>
          </div>

          <div role="tablist" class="tabs tabs-boxed mb-3">
            <a role="tab" class="tab" [class.tab-active]="audience() === 'all'"     (click)="audience.set('all')">All Students <span *ngIf="audienceCount('all') > 0" class="badge badge-sm ml-1">{{ audienceCount('all') }}</span></a>
            <a role="tab" class="tab" [class.tab-active]="audience() === 'dueSoon'" (click)="audience.set('dueSoon')">Due Soon <span *ngIf="audienceCount('dueSoon') > 0" class="badge badge-sm badge-warning ml-1">{{ audienceCount('dueSoon') }}</span></a>
            <a role="tab" class="tab" [class.tab-active]="audience() === 'overdue'" (click)="audience.set('overdue')">Overdue <span *ngIf="audienceCount('overdue') > 0" class="badge badge-sm badge-error ml-1">{{ audienceCount('overdue') }}</span></a>
          </div>

          <label class="input input-bordered flex items-center gap-2 mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
            <input class="grow" [(ngModel)]="search" placeholder="Search by name, phone or cabin…" />
            <button *ngIf="search" class="opacity-60" (click)="search = ''">✕</button>
          </label>

          <div *ngIf="loading()" class="text-center py-8"><span class="loading loading-spinner loading-md"></span></div>

          <div *ngIf="!loading() && filteredRecipients().length === 0" class="text-center opacity-60 py-8">
            <div class="text-base mb-1">No students in this view.</div>
          </div>

          <div class="space-y-2 max-h-[460px] overflow-y-auto pr-1">
            <div *ngFor="let r of filteredRecipients()"
                 class="flex items-center gap-3 p-3 rounded-lg border border-base-200 hover:border-base-300 hover:bg-base-200 transition-all">
              <div class="w-9 h-9 rounded-full grid place-items-center text-sm font-semibold shrink-0"
                   [class]="avatarHueClass(r.id)">
                {{ initials(r.fullName) }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium truncate">{{ r.fullName }}</div>
                <div class="text-xs opacity-60 truncate">{{ r.code }}</div>
              </div>
              <div class="hidden md:block text-xs text-center shrink-0 min-w-[110px]">
                <div class="opacity-70 truncate">{{ r.cabin || '—' }}</div>
                <div class="opacity-60" *ngIf="r.dueDate">
                  <span class="inline-block">🕒</span>
                  {{ r.dueDate | date:'dd/MM/yyyy' }}
                </div>
              </div>
              <div class="hidden md:block text-xs opacity-70 shrink-0">{{ r.phone }}</div>
              <button type="button"
                      class="btn btn-sm btn-success gap-1 shrink-0"
                      [disabled]="!r.phone"
                      (click)="sendOne(r)"
                      title="Open WhatsApp with the composed message">
                <span>💬</span> Send
              </button>
            </div>
          </div>

          <div *ngIf="filteredRecipients().length > 1" class="mt-4 pt-3 border-t border-base-200 flex items-center justify-between flex-wrap gap-2 text-sm">
            <span class="opacity-60">Bulk-send opens one WhatsApp tab per student.</span>
            <button type="button" class="btn btn-sm btn-outline btn-success"
                    (click)="sendBulk()">Send to all {{ filteredRecipients().length }}</button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class WhatsappComponent implements OnInit {
  private studentsApi = inject(StudentsApiService);
  private alertsApi = inject(AlertsApiService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  variables = [
    { token: '{name}',    label: 'Student full name' },
    { token: '{amount}',  label: 'Monthly fee' },
    { token: '{cabin}',   label: 'Cabin or room number' },
    { token: '{duedate}', label: 'Due date' },
    { token: '{pgname}',  label: 'Your business name' },
    { token: '{phone}',   label: 'Your contact number' },
  ];

  // ----- State -----
  loading = signal(false);
  students = signal<StudentRow[]>([]);
  alerts = signal<AlertsResponse | null>(null);
  audience = signal<Audience>('all');
  search = '';

  activeTemplate = signal<TemplateKey>('reminder7');
  templates = signal<Record<TemplateKey, string>>({ ...DEFAULT_TEMPLATES, custom: '' });
  dirty = signal(false);

  senderName = signal('');
  replyPhone = signal('');

  messageText = computed(() => this.templates()[this.activeTemplate()]);

  recipients = computed<Recipient[]>(() => {
    const all = this.students();
    const a = this.alerts();
    const overdueIds = new Set((a?.overdue ?? []).map((x) => x.student.id));
    const dueSoonIds = new Set((a?.dueSoon ?? []).map((x) => x.student.id));

    // Build a quick lookup from alerts so we get the rate + due date for each.
    const seatInfo = new Map<string, { amount: number; dueDate: string; daysFromDue: number; isOverdue: boolean }>();
    (a?.overdue ?? []).forEach((o) =>
      seatInfo.set(o.student.id, {
        amount: o.monthlyRate ?? 0,
        dueDate: o.nextDueDate,
        daysFromDue: -Math.abs(o.daysPast),
        isOverdue: true,
      }),
    );
    (a?.dueSoon ?? []).forEach((d) =>
      seatInfo.set(d.student.id, {
        amount: d.monthlyRate ?? 0,
        dueDate: d.nextDueDate,
        daysFromDue: d.daysUntil,
        isOverdue: false,
      }),
    );

    return all.map<Recipient>((s) => {
      const info = seatInfo.get(s.id);
      const cabin = s.activeSeat?.seatCode ?? '';
      return {
        id: s.id,
        fullName: s.fullName,
        code: s.code,
        phone: s.phone,
        cabin,
        amount: info?.amount ?? s.activeSeat?.monthlyRate ?? 0,
        dueDate: info?.dueDate ?? s.activeSeat?.nextDueDate ?? '',
        isOverdue: info?.isOverdue ?? (overdueIds.has(s.id)),
        daysFromDue: info?.daysFromDue ?? (overdueIds.has(s.id) ? -1 : dueSoonIds.has(s.id) ? 1 : 999),
      };
    });
  });

  filteredRecipients = computed<Recipient[]>(() => {
    const aud = this.audience();
    const q = this.search.trim().toLowerCase();
    let rows = this.recipients();
    if (aud === 'overdue') rows = rows.filter((r) => r.isOverdue);
    else if (aud === 'dueSoon') rows = rows.filter((r) => !r.isOverdue && r.daysFromDue > 0 && r.daysFromDue <= 7);
    if (q) {
      rows = rows.filter((r) =>
        r.fullName.toLowerCase().includes(q) ||
        r.phone.toLowerCase().includes(q) ||
        r.cabin.toLowerCase().includes(q),
      );
    }
    return rows;
  });

  audienceCount(a: Audience): number {
    if (a === 'all') return this.recipients().length;
    if (a === 'overdue') return this.recipients().filter((r) => r.isOverdue).length;
    return this.recipients().filter((r) => !r.isOverdue && r.daysFromDue > 0 && r.daysFromDue <= 7).length;
  }

  ngOnInit() {
    this.restoreFromStorage();
    this.loadData();
  }

  // ----- Persistence -----
  private restoreFromStorage() {
    try {
      const t = localStorage.getItem(LS_KEY_TEMPLATES);
      if (t) {
        const parsed = JSON.parse(t);
        this.templates.set({ ...DEFAULT_TEMPLATES, custom: '', ...parsed });
      }
      const s = localStorage.getItem(LS_KEY_SETTINGS);
      if (s) {
        const parsed = JSON.parse(s);
        this.senderName.set(parsed.senderName ?? this.defaultSenderName());
        this.replyPhone.set(parsed.replyPhone ?? '');
        return;
      }
    } catch { /* ignore corrupt JSON */ }
    this.senderName.set(this.defaultSenderName());
  }
  private persistTemplates() {
    try { localStorage.setItem(LS_KEY_TEMPLATES, JSON.stringify(this.templates())); } catch {}
  }
  private persistSettings() {
    try {
      localStorage.setItem(LS_KEY_SETTINGS, JSON.stringify({
        senderName: this.senderName(),
        replyPhone: this.replyPhone(),
      }));
    } catch {}
  }
  setSenderName(v: string) { this.senderName.set(v); this.persistSettings(); }
  setReplyPhone(v: string) { this.replyPhone.set(v); this.persistSettings(); }

  private defaultSenderName(): string {
    const slug = this.auth.user()?.tenantSlug;
    if (!slug) return 'Our Library';
    return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // ----- Data load -----
  loadData() {
    this.loading.set(true);
    forkJoin({
      students: this.studentsApi.list({ limit: 1000, status: 'ACTIVE', sortBy: 'fullName', sortOrder: 'asc' }),
      alerts: this.alertsApi.list(),
    }).subscribe({
      next: (r) => {
        this.students.set(r.students.data);
        this.alerts.set(r.alerts);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('Could not load students');
        this.loading.set(false);
      },
    });
  }

  // ----- Template handling -----
  pickTemplate(key: TemplateKey) {
    this.activeTemplate.set(key);
    this.dirty.set(false);
  }
  onMessageChange(value: string) {
    const key = this.activeTemplate();
    this.templates.update((t) => ({ ...t, [key]: value }));
    this.dirty.set(true);
  }
  resetTemplate() {
    const key = this.activeTemplate();
    const def = key === 'custom' ? '' : DEFAULT_TEMPLATES[key];
    this.templates.update((t) => ({ ...t, [key]: def }));
    this.dirty.set(false);
    this.persistTemplates();
    this.toast.success('Template reset to default');
  }

  // ----- Send -----
  private substitute(template: string, r: Recipient): string {
    return template
      .replace(/\{name\}/g,    r.fullName)
      .replace(/\{amount\}/g,  String(r.amount || 0))
      .replace(/\{cabin\}/g,   r.cabin || '—')
      .replace(/\{duedate\}/g, r.dueDate ? new Date(r.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
      .replace(/\{pgname\}/g,  this.senderName() || this.defaultSenderName())
      .replace(/\{phone\}/g,   this.replyPhone() || '—');
  }

  private cleanPhone(phone: string): string {
    // wa.me wants country-code + number, no '+' or symbols
    const digits = phone.replace(/[^\d]/g, '');
    // Assume Indian numbers if user typed 10 digits with no country code
    if (digits.length === 10) return '91' + digits;
    return digits;
  }

  sendOne(r: Recipient) {
    if (!r.phone) {
      this.toast.error(`${r.fullName} has no phone on file`);
      return;
    }
    this.persistTemplates();
    const text = this.substitute(this.messageText(), r);
    const url = `https://wa.me/${this.cleanPhone(r.phone)}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener');
  }

  sendBulk() {
    const rows = this.filteredRecipients().filter((r) => !!r.phone);
    if (rows.length === 0) return;
    if (rows.length > 10 && !confirm(`This will open ${rows.length} WhatsApp tabs. Continue?`)) return;
    this.persistTemplates();
    rows.forEach((r, i) => {
      const text = this.substitute(this.messageText(), r);
      const url = `https://wa.me/${this.cleanPhone(r.phone)}?text=${encodeURIComponent(text)}`;
      // Tiny stagger to dodge browser pop-up blockers
      setTimeout(() => window.open(url, '_blank', 'noopener'), i * 120);
    });
    this.toast.success(`Opening ${rows.length} WhatsApp tab${rows.length === 1 ? '' : 's'}…`);
  }

  // ----- Avatar helpers (deterministic colored circle) -----
  private readonly avatarHues = [
    'bg-rose-200 text-rose-800',
    'bg-amber-200 text-amber-800',
    'bg-emerald-200 text-emerald-800',
    'bg-sky-200 text-sky-800',
    'bg-indigo-200 text-indigo-800',
    'bg-fuchsia-200 text-fuchsia-800',
    'bg-teal-200 text-teal-800',
  ];
  avatarHueClass(id: string): string {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return this.avatarHues[h % this.avatarHues.length];
  }
  initials(name: string): string {
    return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  }
}
