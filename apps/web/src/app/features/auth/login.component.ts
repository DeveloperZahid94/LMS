import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { ThemeService } from '../../core/services/theme.service';
import { ToastContainerComponent } from '../../shared/components/toast-container.component';

@Component({
  selector: 'lms-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ToastContainerComponent],
  template: `
    <lms-toast-container />
    <div class="min-h-screen w-full bg-base-200 lg:grid lg:grid-cols-2">

      <!-- ============================ LEFT · BRAND PANEL ============================ -->
      <aside class="relative hidden lg:flex flex-col justify-between overflow-hidden p-12
                    text-primary-content bg-gradient-to-br from-primary via-primary to-secondary">
        <!-- soft decorative glows -->
        <div class="pointer-events-none absolute -top-28 -left-24 w-96 h-96 rounded-full bg-white/10 blur-3xl"></div>
        <div class="pointer-events-none absolute -bottom-32 -right-20 w-[30rem] h-[30rem] rounded-full bg-secondary/40 blur-3xl"></div>
        <div class="pointer-events-none absolute inset-0 opacity-[0.07]"
             style="background-image:radial-gradient(currentColor 1px,transparent 1px);background-size:22px 22px;"></div>

        <!-- brand -->
        <div class="relative flex items-center gap-3">
          <div class="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur grid place-items-center font-bold text-xl shadow-lg">L</div>
          <span class="text-lg font-semibold tracking-tight">LMS Platform</span>
        </div>

        <!-- headline + value props -->
        <div class="relative max-w-md anim-rise">
          <h1 class="text-4xl xl:text-5xl font-bold leading-[1.1] tracking-tight">
            Run your library<br />like clockwork.
          </h1>
          <p class="mt-5 text-base text-primary-content/80 leading-relaxed">
            Seats, students, payments, attendance and reminders — all in one calm, fast dashboard.
          </p>

          <ul class="mt-9 space-y-4">
            <li class="flex items-start gap-3" *ngFor="let f of features">
              <span class="mt-0.5 w-6 h-6 rounded-full bg-white/15 grid place-items-center shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span class="text-sm text-primary-content/90">{{ f }}</span>
            </li>
          </ul>
        </div>

        <div class="relative text-xs text-primary-content/60">
          © {{ year }} LMS Platform · Multi-tenant SaaS
        </div>
      </aside>

      <!-- ============================ RIGHT · LOGIN FORM ============================ -->
      <main class="relative flex items-center justify-center p-6 sm:p-10 min-h-screen lg:min-h-0">
        <!-- theme toggle -->
        <button class="btn btn-ghost btn-sm btn-circle absolute top-4 right-4"
                (click)="theme.toggle()" [title]="theme.isDark() ? 'Light mode' : 'Dark mode'">
          <span *ngIf="theme.isDark()">☀</span>
          <span *ngIf="!theme.isDark()">☾</span>
        </button>

        <div class="w-full max-w-sm anim-rise">
          <!-- compact brand (mobile only) -->
          <div class="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div class="w-10 h-10 rounded-xl bg-primary text-primary-content grid place-items-center font-bold text-lg shadow">L</div>
            <span class="text-lg font-semibold">LMS Platform</span>
          </div>

          <h2 class="text-2xl font-bold tracking-tight">Welcome back</h2>
          <p class="text-sm opacity-60 mt-1">Sign in to your library management portal.</p>

          <form [formGroup]="form" (ngSubmit)="submit()" class="mt-7 space-y-4">
            <!-- Tenant slug -->
            <div class="form-control w-full">
              <div class="label py-1"><span class="label-text font-medium">Library slug</span></div>
              <label class="input input-bordered flex items-center gap-2 focus-within:border-primary transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
                </svg>
                <input class="grow" formControlName="tenantSlug" placeholder="demo-library" autocapitalize="off" spellcheck="false" />
              </label>
            </div>

            <!-- Email -->
            <div class="form-control w-full">
              <div class="label py-1"><span class="label-text font-medium">Email</span></div>
              <label class="input input-bordered flex items-center gap-2 focus-within:border-primary transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 8l9 6 9-6M3 8v8a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <input class="grow" type="email" formControlName="email" autocomplete="email" placeholder="you@example.com" />
              </label>
            </div>

            <!-- Password -->
            <div class="form-control w-full">
              <div class="label py-1"><span class="label-text font-medium">Password</span></div>
              <label class="input input-bordered flex items-center gap-2 focus-within:border-primary transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 11v4m-6 5h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zM8 9V7a4 4 0 118 0v2" />
                </svg>
                <input class="grow" [type]="showPw() ? 'text' : 'password'" formControlName="password"
                       autocomplete="current-password" placeholder="••••••••" />
                <button type="button" class="opacity-50 hover:opacity-100 transition-opacity"
                        (click)="showPw.set(!showPw())" [title]="showPw() ? 'Hide password' : 'Show password'">
                  <svg *ngIf="!showPw()" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <svg *ngIf="showPw()" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.477 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88L3 3m6.88 6.88L21 21" />
                  </svg>
                </button>
              </label>
            </div>

            <button class="btn btn-primary w-full mt-2 shadow-lg shadow-primary/30" type="submit"
                    [disabled]="form.invalid || loading()">
              <span *ngIf="loading()" class="loading loading-spinner loading-sm"></span>
              {{ loading() ? 'Signing in…' : 'Sign in' }}
            </button>
          </form>

          <!-- secondary links -->
          <div class="flex items-center justify-center mt-5 text-xs">
            <a routerLink="/student-login" class="link link-hover opacity-70">🎓 Student portal</a>
          </div>
        </div>
      </main>
    </div>
  `,
  styles: [`
    .anim-rise { animation: rise .5s cubic-bezier(.16,1,.3,1) both; }
    @keyframes rise {
      from { opacity: 0; transform: translateY(14px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @media (prefers-reduced-motion: reduce) { .anim-rise { animation: none; } }
  `],
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);
  theme = inject(ThemeService);

  loading = signal(false);
  showPw = signal(false);
  readonly year = new Date().getFullYear();

  readonly features = [
    'Smart seat & cabin allocation',
    'Automated fee reminders via WhatsApp & SMS',
    'Live payments, collections & reports',
  ];

  form = this.fb.nonNullable.group({
    tenantSlug: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  fillDemo() {
    this.form.setValue({ tenantSlug: 'demo-library', email: 'admin@demo-library.local', password: 'Admin@123' });
  }

  submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    const { tenantSlug, email, password } = this.form.getRawValue();
    this.auth.login({ email, password, tenantSlug: tenantSlug || undefined }).subscribe({
      next: (res) => {
        if (res.user.mustChangePassword) {
          this.toast.info('Please set a new password to continue.');
          this.router.navigate(['/change-password']);
          return;
        }
        this.toast.success('Welcome back!');
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        const msg = err.error?.message ?? 'Login failed';
        this.toast.error(Array.isArray(msg) ? msg.join(' · ') : msg);
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
  }
}
