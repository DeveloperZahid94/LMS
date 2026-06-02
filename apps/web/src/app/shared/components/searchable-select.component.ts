import {
  Component, computed, ElementRef, forwardRef, HostListener, Input, signal, ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface ComboItem {
  id: string;
  label: string;
  sublabel?: string;
  badge?: string;
  disabled?: boolean;
  /** Tooltip explaining why this option is disabled. */
  disabledReason?: string;
}

@Component({
  selector: 'lms-searchable-select',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SearchableSelectComponent), multi: true },
  ],
  template: `
    <div class="relative" #host>
      <button type="button"
              class="input input-bordered w-full text-left flex items-center justify-between gap-2"
              [class.input-disabled]="disabled"
              (click)="toggle()"
              [disabled]="disabled">
        <span *ngIf="selected() as s; else placeholderText" class="truncate flex items-center gap-2">
          <span>{{ s.label }}</span>
          <span *ngIf="s.sublabel" class="text-xs opacity-60">{{ s.sublabel }}</span>
        </span>
        <ng-template #placeholderText>
          <span class="opacity-60 truncate">{{ placeholder }}</span>
        </ng-template>
        <span class="opacity-50 shrink-0">▾</span>
      </button>

      <div *ngIf="open()"
           class="absolute z-30 mt-1 w-full bg-base-100 rounded-box shadow-lg border border-base-300 overflow-hidden">
        <div class="p-2 border-b border-base-300">
          <input #searchInput type="text" class="input input-bordered input-sm w-full"
                 [placeholder]="searchPlaceholder"
                 [(ngModel)]="query"
                 (ngModelChange)="onSearchChange()"
                 (keydown.escape)="close()" />
        </div>
        <div class="max-h-72 overflow-auto py-1">
          <button *ngFor="let it of filtered(); trackBy: trackById"
                  type="button"
                  class="w-full text-left px-3 py-2 flex items-center justify-between gap-2 hover:bg-base-200 transition-colors"
                  [class.opacity-40]="it.disabled"
                  [class.cursor-not-allowed]="it.disabled"
                  [class.bg-primary]="!it.disabled && it.id === value()"
                  [class.bg-opacity-10]="!it.disabled && it.id === value()"
                  [title]="it.disabled ? (it.disabledReason || 'Not available') : ''"
                  [disabled]="it.disabled"
                  (click)="select(it)">
            <div class="min-w-0 flex-1">
              <div class="text-sm truncate">{{ it.label }}</div>
              <div *ngIf="it.sublabel" class="text-xs opacity-60 truncate">{{ it.sublabel }}</div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span *ngIf="it.badge" class="badge badge-sm" [class.badge-ghost]="it.disabled" [class.badge-primary]="!it.disabled">{{ it.badge }}</span>
              <span *ngIf="!it.disabled && it.id === value()" class="text-primary">✓</span>
            </div>
          </button>
          <div *ngIf="filtered().length === 0" class="text-center opacity-60 py-4 text-sm">
            No matches{{ query() ? ' for "' + query() + '"' : '' }}.
          </div>
        </div>
        <div *ngIf="value() && allowClear" class="border-t border-base-300 p-1">
          <button type="button" class="w-full text-left px-3 py-1.5 text-sm text-error hover:bg-base-200 rounded" (click)="clear()">
            Clear selection
          </button>
        </div>
      </div>
    </div>
  `,
})
export class SearchableSelectComponent implements ControlValueAccessor {
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLElement>;
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  /**
   * Items are stored in an internal signal so that `filtered` recomputes when
   * the parent's items array changes asynchronously (e.g. a `computed()` that
   * depends on a fetch). Plain `@Input` arrays don't trigger signal-based
   * recomputation.
   */
  private itemsSig = signal<ComboItem[]>([]);
  @Input() set items(v: ComboItem[] | null | undefined) { this.itemsSig.set(v ?? []); }
  get items(): ComboItem[] { return this.itemsSig(); }

  @Input() placeholder = 'Select…';
  @Input() searchPlaceholder = 'Search…';
  @Input() allowClear = true;

  open = signal(false);
  query = signal('');
  value = signal<string | null>(null);
  disabled = false;
  private onChange: (v: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  filtered = computed(() => {
    const list = this.itemsSig();
    const q = this.query().trim().toLowerCase();
    if (!q) return list;
    return list.filter((it) =>
      it.label.toLowerCase().includes(q) ||
      (it.sublabel?.toLowerCase().includes(q) ?? false),
    );
  });

  selected = computed(() => this.itemsSig().find((i) => i.id === this.value()) ?? null);

  toggle() {
    if (this.disabled) return;
    if (this.open()) this.close();
    else this.openPanel();
  }
  openPanel() {
    this.open.set(true);
    this.query.set('');
    setTimeout(() => this.searchInput?.nativeElement.focus(), 0);
  }
  close() {
    this.open.set(false);
    this.onTouched();
  }
  onSearchChange() { /* triggers filtered() recompute via signal */ }

  select(it: ComboItem) {
    if (it.disabled) return;
    this.value.set(it.id);
    this.onChange(it.id);
    this.close();
  }
  clear() {
    this.value.set(null);
    this.onChange(null);
    this.close();
  }
  trackById(_: number, it: ComboItem) { return it.id; }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent) {
    if (!this.open()) return;
    if (!this.host.nativeElement.contains(ev.target as Node)) this.close();
  }

  // ---- ControlValueAccessor ----
  writeValue(v: string | null): void { this.value.set(v ?? null); }
  registerOnChange(fn: (v: string | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled = d; }
}
