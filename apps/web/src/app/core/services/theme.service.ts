import { Injectable, computed, signal } from '@angular/core';

const KEY = 'lms.theme';
const LIGHT_KEY = 'lms.theme.light';

export type Theme = 'light' | 'dark' | 'indigo' | 'violet' | 'teal' | 'mono' | 'sunset' | 'candy';

export interface ThemeOption {
  key: Theme;
  label: string;
  description: string;
  mode: 'light' | 'dark';
  /** [primary, secondary, accent] preview swatches */
  swatch: [string, string, string];
}

/** Selectable themes shown in Settings → Appearance. */
export const THEMES: ThemeOption[] = [
  { key: 'indigo', label: 'Refined Indigo', description: 'Clean, trustworthy SaaS', mode: 'light', swatch: ['#4f46e5', '#0ea5e9', '#10b981'] },
  { key: 'violet', label: 'Slate + Violet', description: 'Premium & editorial',     mode: 'light', swatch: ['#6d28d9', '#7c3aed', '#f59e0b'] },
  { key: 'teal',   label: 'Teal Fintech',   description: 'Calm, data-focused',      mode: 'light', swatch: ['#0f766e', '#0891b2', '#f59e0b'] },
  { key: 'mono',   label: 'Mono + Accent',  description: 'Minimal, high-contrast',  mode: 'light', swatch: ['#18181b', '#4f46e5', '#4f46e5'] },
  { key: 'sunset', label: 'Coral Sunset',   description: 'Warm & colorful',         mode: 'light', swatch: ['#f97316', '#ec4899', '#8b5cf6'] },
  { key: 'candy',  label: 'Candy Pop',      description: 'Playful & colorful',      mode: 'light', swatch: ['#d946ef', '#8b5cf6', '#06b6d4'] },
  { key: 'dark',   label: 'Dark',           description: 'Easy on the eyes',        mode: 'dark',  swatch: ['#6366f1', '#0ea5e9', '#10b981'] },
];

const KNOWN = new Set<Theme>(['light', 'dark', 'indigo', 'violet', 'teal', 'mono', 'sunset', 'candy']);
const DEFAULT_LIGHT: Theme = 'indigo';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly themes = THEMES;
  theme = signal<Theme>(this.readSaved());
  isDark = computed(() => this.theme() === 'dark');

  constructor() {
    this.apply(this.theme());
  }

  /** Explicitly select any theme (used by the Settings picker). */
  set(theme: Theme) {
    if (!KNOWN.has(theme)) return;
    this.theme.set(theme);
    localStorage.setItem(KEY, theme);
    if (theme !== 'dark') localStorage.setItem(LIGHT_KEY, theme);
    this.apply(theme);
  }

  /** Header button: flip between dark and the last-used light palette. */
  toggle() {
    this.set(this.isDark() ? this.lastLight() : 'dark');
  }

  private lastLight(): Theme {
    const s = localStorage.getItem(LIGHT_KEY) as Theme | null;
    return s && KNOWN.has(s) && s !== 'dark' ? s : DEFAULT_LIGHT;
  }

  private apply(theme: Theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  private readSaved(): Theme {
    const stored = localStorage.getItem(KEY) as Theme | null;
    if (stored && KNOWN.has(stored)) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : DEFAULT_LIGHT;
  }
}
