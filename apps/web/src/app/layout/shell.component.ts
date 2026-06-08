import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FeatureKey } from '@lms/shared';
import { AuthService } from '../core/services/auth.service';
import { ThemeService } from '../core/services/theme.service';
import { ToastContainerComponent } from '../shared/components/toast-container.component';
import { AlertsApiService } from '../features/alerts/alerts.service';

interface NavItem {
  label: string;
  icon: string;
  path: string;
  /** When set, the item only shows for tenants that have this feature enabled. */
  feature?: FeatureKey;
}

@Component({
  selector: 'lms-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, ToastContainerComponent],
  template: `
    <lms-toast-container />
    <div class="drawer lg:drawer-open min-h-screen bg-base-200">
      <input id="lms-drawer" type="checkbox" class="drawer-toggle" />

      <!-- Page content -->
      <div class="drawer-content flex flex-col">
        <!-- Top navbar -->
        <header class="navbar bg-base-100/80 backdrop-blur-md border-b border-base-300 px-4 sticky top-0 z-10 min-h-[3.5rem]">
          <div class="flex-none">
            <!-- Hamburger: toggles desktop collapse, opens drawer on mobile -->
            <label for="lms-drawer" class="btn btn-ghost btn-square btn-sm lg:hidden" title="Open menu">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </label>
            <button type="button" class="btn btn-ghost btn-square btn-sm hidden lg:inline-flex"
                    (click)="toggleCollapsed()"
                    [title]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>

          <div class="flex-1"></div>

          <div class="flex-none gap-1">
            <button class="btn btn-ghost btn-circle btn-sm relative" (click)="goAlerts()" title="Alerts">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span *ngIf="alertCount() > 0"
                    class="badge badge-error badge-xs absolute -top-0.5 -right-0.5 font-semibold">
                {{ alertCount() > 99 ? '99+' : alertCount() }}
              </span>
            </button>
            <button class="btn btn-ghost btn-circle btn-sm" (click)="theme.toggle()" [title]="theme.isDark() ? 'Light mode' : 'Dark mode'">
              <span *ngIf="theme.isDark()">☀</span>
              <span *ngIf="!theme.isDark()">☾</span>
            </button>
            <div class="dropdown dropdown-end" *ngIf="auth.user() as u">
              <div tabindex="0" role="button" class="btn btn-ghost btn-sm flex items-center gap-2 normal-case">
                <div class="avatar placeholder">
                  <div class="bg-gradient-to-br from-primary to-secondary text-primary-content rounded-full w-8">
                    <span class="text-xs font-semibold">{{ initials(u.fullName) }}</span>
                  </div>
                </div>
                <div class="text-left hidden md:block">
                  <div class="text-sm font-medium leading-tight">{{ u.fullName }}</div>
                  <div class="text-[10px] opacity-60 leading-tight uppercase tracking-wider">{{ u.role }}</div>
                </div>
              </div>
              <ul tabindex="0" class="menu dropdown-content bg-base-100 rounded-box shadow-lg z-30 mt-2 w-56 p-2 border border-base-300">
                <li class="menu-title text-xs truncate">{{ u.email }}</li>
                <li><a routerLink="/settings"><span>⚙</span> Settings</a></li>
                <li><a (click)="auth.logout()" class="text-error"><span>⤴</span> Sign out</a></li>
              </ul>
            </div>
          </div>
        </header>

        <main class="flex-1 px-6 pt-3 pb-6 overflow-auto">
          <router-outlet />
        </main>
      </div>

      <!-- =============================== SIDEBAR =============================== -->
      <aside class="drawer-side z-20">
        <label for="lms-drawer" class="drawer-overlay"></label>
        <div class="bg-base-100 min-h-full border-r border-base-300 flex flex-col transition-[width] duration-300 ease-in-out shadow-sm"
             [class.w-64]="!collapsed()"
             [class.w-16]="collapsed()">

          <!-- Brand block — matched to header height so logo & hamburger sit on the same row -->
          <div class="min-h-[3.5rem] px-3 border-b border-base-300 flex items-center gap-3"
               [class.justify-center]="collapsed()">
            <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary text-primary-content grid place-items-center font-bold text-base shadow-sm shrink-0">
              L
            </div>
            <div class="overflow-hidden transition-opacity leading-tight"
                 [class.opacity-0]="collapsed()"
                 [class.pointer-events-none]="collapsed()"
                 [class.w-0]="collapsed()">
              <div class="font-semibold whitespace-nowrap text-sm">LMS Platform</div>
              <div class="text-[10px] opacity-60 whitespace-nowrap truncate uppercase tracking-wider">{{ auth.user()?.tenantSlug || 'platform' }}</div>
            </div>
          </div>

          <!-- Nav items -->
          <ul class="flex-1 px-2 pt-3 pb-1 space-y-0.5 overflow-y-auto">
            <li *ngFor="let n of nav()">
              <a [routerLink]="n.path"
                 routerLinkActive="lms-nav-active"
                 [routerLinkActiveOptions]="{ exact: false }"
                 class="lms-nav-link"
                 [class.lms-nav-link--collapsed]="collapsed()"
                 [title]="collapsed() ? n.label : ''">
                <span class="lms-nav-icon">{{ n.icon }}</span>
                <span class="lms-nav-label" [class.hidden]="collapsed()">{{ n.label }}</span>
              </a>
            </li>
          </ul>

          <!-- Footer / user summary (only when expanded) -->
          <div class="border-t border-base-300 px-3 py-3 transition-opacity"
               [class.opacity-0]="collapsed()"
               [class.h-0]="collapsed()"
               [class.py-0]="collapsed()"
               [class.overflow-hidden]="collapsed()"
               *ngIf="auth.user() as u">
            <div class="flex items-center gap-2 text-xs">
              <div class="w-8 h-8 rounded-full bg-base-200 grid place-items-center font-semibold shrink-0">
                {{ initials(u.fullName) }}
              </div>
              <div class="min-w-0 flex-1">
                <div class="font-medium truncate">{{ u.fullName }}</div>
                <div class="opacity-60 truncate text-[10px] uppercase tracking-wider">{{ u.role }}</div>
              </div>
              <button class="btn btn-ghost btn-xs btn-square" (click)="auth.logout()" title="Sign out">⤴</button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  `,
  styles: [`
    /* ----- Sidebar nav-link styling (more aesthetic than DaisyUI's default menu) ----- */
    .lms-nav-link {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.55rem 0.75rem;
      border-radius: 0.7rem;
      font-size: 0.875rem;
      font-weight: 500;
      color: hsl(var(--bc) / 0.72);
      transition: background-color .2s ease, color .2s ease, transform .15s ease, box-shadow .25s ease;
      cursor: pointer;
      position: relative;
      isolation: isolate;
    }
    /* Hover: gentle tinted fill + slide toward content */
    .lms-nav-link:hover {
      background: hsl(var(--b2));
      color: hsl(var(--bc));
      transform: translateX(3px);
    }
    /* Tactile press feedback when a menu is clicked */
    .lms-nav-link:active {
      transform: translateX(3px) scale(.96);
    }

    /* Active item: SOLID primary-coloured pill so it's unmistakable */
    .lms-nav-link.lms-nav-active,
    .lms-nav-link.lms-nav-active:hover {
      background: hsl(var(--p));
      color: hsl(var(--pc));
      font-weight: 600;
      box-shadow: 0 8px 18px -6px hsl(var(--p) / 0.6);
      animation: lms-nav-pop .3s cubic-bezier(.16, 1, .3, 1);
    }
    .lms-nav-link.lms-nav-active:hover { transform: translateX(3px); }

    /* Bright accent bar at the left edge of the active pill */
    .lms-nav-link.lms-nav-active::before {
      content: '';
      position: absolute;
      left: 0;
      top: 50%;
      width: 3px;
      height: 58%;
      background: hsl(var(--pc));
      border-radius: 999px;
      transform: translateY(-50%);
      animation: lms-nav-bar .32s cubic-bezier(.16, 1, .3, 1);
    }

    /* Pointing hand on the active item — wiggles to draw the eye */
    .lms-nav-link.lms-nav-active::after {
      content: '👈';
      margin-left: auto;
      font-size: 1rem;
      line-height: 1;
      filter: drop-shadow(0 1px 1px rgba(0,0,0,.25));
      animation: lms-nav-point .7s ease-in-out infinite alternate;
    }
    /* No room for the hand when the rail is collapsed */
    .lms-nav-link.lms-nav-link--collapsed.lms-nav-active::after {
      display: none;
    }

    .lms-nav-link.lms-nav-link--collapsed {
      justify-content: center;
      padding: 0.55rem 0;
    }

    .lms-nav-icon {
      width: 1.75rem;
      height: 1.75rem;
      display: inline-grid;
      place-items: center;
      flex-shrink: 0;
      font-size: 1rem;
      border-radius: 0.5rem;
      background: hsl(var(--b2));
      transition: background-color .2s ease, color .2s ease, transform .2s ease, box-shadow .25s ease;
    }
    .lms-nav-link:hover .lms-nav-icon {
      transform: scale(1.1) rotate(-4deg);
    }
    .lms-nav-link.lms-nav-active .lms-nav-icon {
      background: hsl(var(--pc) / 0.2);
      color: hsl(var(--pc));
      transform: scale(1.06);
    }
    .lms-nav-label {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    @keyframes lms-nav-pop {
      from { transform: translateX(-5px); opacity: .55; }
      to   { transform: translateX(0);    opacity: 1; }
    }
    @keyframes lms-nav-bar {
      from { height: 0;   opacity: 0; }
      to   { height: 58%; opacity: 1; }
    }
    @keyframes lms-nav-point {
      from { transform: translateX(0); }
      to   { transform: translateX(-4px); }
    }

    /* Respect users who prefer minimal motion */
    @media (prefers-reduced-motion: reduce) {
      .lms-nav-link,
      .lms-nav-link:hover,
      .lms-nav-link:active,
      .lms-nav-link .lms-nav-icon,
      .lms-nav-link:hover .lms-nav-icon { transform: none; }
      .lms-nav-link.lms-nav-active,
      .lms-nav-link.lms-nav-active::before,
      .lms-nav-link.lms-nav-active::after { animation: none; }
    }
  `],
})
export class ShellComponent implements OnInit {
  auth = inject(AuthService);
  theme = inject(ThemeService);
  private router = inject(Router);
  private alertsApi = inject(AlertsApiService);
  collapsed = signal(this.readCollapsed());
  alertCount = signal(0);

  ngOnInit() {
    this.refreshAlerts();
    // Refresh the bell count every 60s so it stays roughly fresh while staff browse.
    setInterval(() => this.refreshAlerts(), 60_000);
  }

  toggleCollapsed() {
    const next = !this.collapsed();
    this.collapsed.set(next);
    try { localStorage.setItem('lms.shell.collapsed', next ? '1' : '0'); } catch {}
  }
  private readCollapsed(): boolean {
    try { return localStorage.getItem('lms.shell.collapsed') === '1'; } catch { return false; }
  }

  refreshAlerts() {
    this.alertsApi.list().subscribe({
      next: (r) => this.alertCount.set(r.counts.total),
      error: () => { /* swallow — bell just stays at last known value */ },
    });
  }

  goAlerts() { this.router.navigate(['/alerts']); }

  // Core tenant menu. `feature`-tagged items are hidden when the tenant's plan
  // doesn't include that feature (SuperAdmin toggles these per tenant).
  private readonly baseNav: NavItem[] = [
    { label: 'Dashboard', icon: '◊', path: '/dashboard', feature: FeatureKey.DASHBOARD },
    { label: 'Students', icon: '☺', path: '/students', feature: FeatureKey.STUDENTS },
    { label: 'Seats', icon: '☐', path: '/seats', feature: FeatureKey.SEATS },
    { label: 'PG Rooms', icon: '🛏', path: '/pg-rooms', feature: FeatureKey.PG_ROOMS },
    { label: 'Tiffin', icon: '🍱', path: '/tiffin', feature: FeatureKey.TIFFIN },
    { label: 'Attendance', icon: '✓', path: '/attendance', feature: FeatureKey.QR_ATTENDANCE },
    { label: 'Payments', icon: '₹', path: '/payments', feature: FeatureKey.PAYMENT_GATEWAY },
    { label: 'Alerts',   icon: '⚠', path: '/alerts', feature: FeatureKey.ALERTS },
    { label: 'WhatsApp', icon: '💬', path: '/whatsapp', feature: FeatureKey.WHATSAPP },
    { label: 'Reports',  icon: '📊', path: '/reports', feature: FeatureKey.REPORTS },
    { label: 'Settings', icon: '⚙', path: '/settings', feature: FeatureKey.SETTINGS },
  ];

  // Platform-owner menu — only the SuperAdmin sees these.
  private readonly adminNav: NavItem[] = [
    { label: 'Tenants', icon: '🏢', path: '/admin/tenants' },
    { label: 'Audit Log', icon: '📜', path: '/admin/audit' },
    { label: 'Database', icon: '🗄', path: '/admin/database' },
  ];

  nav = computed<NavItem[]>(() => {
    const user = this.auth.user();
    // SuperAdmin operates across tenants — show the platform console, not tenant screens.
    if (user?.role === 'SUPER_ADMIN') return this.adminNav;
    // Tenant users: hide feature-gated items their plan doesn't include.
    return this.baseNav.filter((n) => !n.feature || this.auth.hasFeature(n.feature));
  });

  initials(name: string): string {
    return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  }
}
