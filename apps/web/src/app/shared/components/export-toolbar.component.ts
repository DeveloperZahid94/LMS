import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/**
 * Compact toolbar with two date pickers and CSV / PDF export buttons.
 * Parent owns the date range as a one-way binding plus events; this keeps it
 * trivial to wire into existing pages that already track filter state.
 */
@Component({
  selector: 'lms-export-toolbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex items-center gap-2 flex-wrap">
      <div class="join">
        <span class="join-item btn btn-sm btn-ghost no-animation pointer-events-none opacity-70">From</span>
        <input type="date" class="join-item input input-bordered input-sm"
               [ngModel]="dateFrom"
               (ngModelChange)="onFromChange($event)"
               [max]="dateTo || null" />
        <span class="join-item btn btn-sm btn-ghost no-animation pointer-events-none opacity-70">To</span>
        <input type="date" class="join-item input input-bordered input-sm"
               [ngModel]="dateTo"
               (ngModelChange)="onToChange($event)"
               [min]="dateFrom || null" />
        <button class="join-item btn btn-sm" type="button" *ngIf="dateFrom || dateTo"
                (click)="clear()" title="Clear date range">✕</button>
      </div>

      <div class="dropdown dropdown-end">
        <div tabindex="0" role="button" class="btn btn-sm btn-outline" [class.btn-disabled]="busy()">
          <span *ngIf="busy()" class="loading loading-spinner loading-xs"></span>
          <span *ngIf="!busy()">⤓</span>
          Export
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box shadow z-30 mt-1 w-40 p-2 border border-base-300">
          <li><a (click)="trigger('csv')"><span>📄</span> Export CSV</a></li>
          <li><a (click)="trigger('pdf')"><span>🖨</span> Export PDF</a></li>
        </ul>
      </div>

      <button type="button"
              *ngIf="showPresets"
              class="btn btn-sm btn-ghost"
              (click)="presetThisMonth()">This month</button>
      <button type="button"
              *ngIf="showPresets"
              class="btn btn-sm btn-ghost"
              (click)="presetLast30()">Last 30d</button>
    </div>
  `,
})
export class ExportToolbarComponent {
  /** ISO date strings (yyyy-mm-dd) for native <input type="date">. */
  @Input() dateFrom: string = '';
  @Input() dateTo: string = '';
  @Input() showPresets = true;

  @Output() dateFromChange = new EventEmitter<string>();
  @Output() dateToChange = new EventEmitter<string>();
  @Output() rangeChange = new EventEmitter<{ from: string; to: string }>();
  @Output() exportRequested = new EventEmitter<'csv' | 'pdf'>();

  busy = signal(false);

  onFromChange(v: string) {
    this.dateFrom = v;
    this.dateFromChange.emit(v);
    this.rangeChange.emit({ from: this.dateFrom, to: this.dateTo });
  }
  onToChange(v: string) {
    this.dateTo = v;
    this.dateToChange.emit(v);
    this.rangeChange.emit({ from: this.dateFrom, to: this.dateTo });
  }
  clear() {
    this.dateFrom = '';
    this.dateTo = '';
    this.dateFromChange.emit('');
    this.dateToChange.emit('');
    this.rangeChange.emit({ from: '', to: '' });
  }

  trigger(kind: 'csv' | 'pdf') {
    if (this.busy()) return;
    (document.activeElement as HTMLElement | null)?.blur();
    this.exportRequested.emit(kind);
  }

  /** Parent calls these wrappers if it wants to show the spinner during the async fetch. */
  setBusy(b: boolean) { this.busy.set(b); }

  presetThisMonth() {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    this.applyPreset(first, now);
  }
  presetLast30() {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    this.applyPreset(from, to);
  }
  private applyPreset(from: Date, to: Date) {
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    this.dateFrom = iso(from);
    this.dateTo = iso(to);
    this.dateFromChange.emit(this.dateFrom);
    this.dateToChange.emit(this.dateTo);
    this.rangeChange.emit({ from: this.dateFrom, to: this.dateTo });
  }
}
