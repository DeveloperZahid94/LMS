import { Injectable, signal } from '@angular/core';

const KEY = 'lms.theme';
export type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  theme = signal<Theme>(this.readSaved());

  constructor() {
    this.apply(this.theme());
  }

  toggle() {
    const next: Theme = this.theme() === 'light' ? 'dark' : 'light';
    this.theme.set(next);
    localStorage.setItem(KEY, next);
    this.apply(next);
  }

  private apply(theme: Theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  private readSaved(): Theme {
    const stored = localStorage.getItem(KEY) as Theme | null;
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
