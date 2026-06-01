import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  /** auto-dismiss delay in ms; 0 = sticky */
  durationMs: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private idCounter = 0;
  toasts = signal<Toast[]>([]);

  show(kind: ToastKind, message: string, durationMs = 4000) {
    const id = ++this.idCounter;
    const toast: Toast = { id, kind, message, durationMs };
    this.toasts.update((arr) => [...arr, toast]);
    if (durationMs > 0) {
      setTimeout(() => this.dismiss(id), durationMs);
    }
    return id;
  }

  success(message: string, durationMs?: number) { return this.show('success', message, durationMs); }
  error(message: string, durationMs?: number)   { return this.show('error',   message, durationMs ?? 6000); }
  info(message: string, durationMs?: number)    { return this.show('info',    message, durationMs); }
  warning(message: string, durationMs?: number) { return this.show('warning', message, durationMs ?? 5000); }

  dismiss(id: number) {
    this.toasts.update((arr) => arr.filter((t) => t.id !== id));
  }

  clear() { this.toasts.set([]); }
}
