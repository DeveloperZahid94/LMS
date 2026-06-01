import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'lms-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast toast-end toast-top z-50">
      <div *ngFor="let t of toast.toasts(); trackBy: trackId"
           class="alert shadow-lg animate-fade-in min-w-[280px] max-w-md cursor-pointer"
           [class.alert-success]="t.kind === 'success'"
           [class.alert-error]="t.kind === 'error'"
           [class.alert-info]="t.kind === 'info'"
           [class.alert-warning]="t.kind === 'warning'"
           (click)="toast.dismiss(t.id)">
        <span class="text-lg">
          {{ t.kind === 'success' ? '✓' : t.kind === 'error' ? '✕' : t.kind === 'warning' ? '!' : 'i' }}
        </span>
        <span class="flex-1 text-sm">{{ t.message }}</span>
        <button class="btn btn-ghost btn-xs btn-circle" (click)="toast.dismiss(t.id); $event.stopPropagation()">✕</button>
      </div>
    </div>
  `,
  styles: [`
    @keyframes lms-fade-in {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in { animation: lms-fade-in .18s ease-out; }
  `],
})
export class ToastContainerComponent {
  toast = inject(ToastService);
  trackId(_: number, t: { id: number }) { return t.id; }
}
