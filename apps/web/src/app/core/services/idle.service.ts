import { Injectable, NgZone, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';

/**
 * Inactivity auto-logout.
 *
 * Watches for user activity (mouse / keyboard / touch / scroll). When the user
 * has been idle for the tenant-configured `autoLogoutMin`, they are signed out.
 * One minute before that, a "Continue / Logout" prompt appears with a live
 * countdown — if they don't respond, logout happens automatically.
 *
 * The timeout is applied **dynamically**: call {@link configure} whenever the
 * setting is loaded or changed (e.g. after the admin saves it in Settings) and
 * the running timer picks up the new value on the next tick — no reload needed.
 */
@Injectable({ providedIn: 'root' })
export class IdleService {
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private zone = inject(NgZone);

  /** Seconds before the limit at which the "still there?" prompt appears. */
  private static readonly WARN_LEAD_SEC = 60;
  /** How often we evaluate idle time. */
  private static readonly TICK_MS = 1000;
  /** Throttle activity resets to at most one per second to stay cheap. */
  private static readonly ACTIVITY_THROTTLE_MS = 1000;

  /** Configured limit, in minutes. 0 / negative disables auto-logout. */
  private timeoutMin = 30;

  /** Whether the warning prompt is currently shown. */
  readonly warningVisible = signal(false);
  /** Seconds left until forced logout while the prompt is shown. */
  readonly countdown = signal(0);

  private lastActivity = 0;
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private lastActivityStamp = 0;
  private readonly activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
  private readonly onActivity = () => this.registerActivity();

  /**
   * Start watching for inactivity using the given limit (minutes).
   * Safe to call repeatedly — it re-arms with the latest value.
   */
  start(timeoutMin: number) {
    this.configure(timeoutMin);
    if (this.tickHandle) return; // already running
    this.lastActivity = this.now();
    this.lastActivityStamp = this.lastActivity;

    // Activity listeners run outside Angular so the constant stream of
    // mousemove events doesn't trigger change detection on every move.
    this.zone.runOutsideAngular(() => {
      for (const ev of this.activityEvents) {
        window.addEventListener(ev, this.onActivity, { passive: true });
      }
      this.tickHandle = setInterval(() => this.tick(), IdleService.TICK_MS);
    });
  }

  /** Stop watching and tear down listeners (call on logout). */
  stop() {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
    for (const ev of this.activityEvents) {
      window.removeEventListener(ev, this.onActivity);
    }
    this.warningVisible.set(false);
    this.countdown.set(0);
  }

  /** Update the limit live; the next tick uses the new value. */
  configure(timeoutMin: number) {
    const next = Number(timeoutMin);
    this.timeoutMin = Number.isFinite(next) && next > 0 ? next : 0;
  }

  /** User chose to stay signed in — reset the idle clock and hide the prompt. */
  continueSession() {
    this.lastActivity = this.now();
    this.lastActivityStamp = this.lastActivity;
    this.warningVisible.set(false);
    this.countdown.set(0);
  }

  /** User chose to sign out now (or the countdown expired). */
  logoutNow(timedOut = false) {
    this.stop();
    this.auth.logout();
    if (timedOut) {
      this.toast.info('You were signed out due to inactivity.');
    }
  }

  /** Throttled activity handler — bumps the idle clock unless the prompt is up. */
  private registerActivity() {
    // While the prompt is showing, ignore passive activity: the user must
    // explicitly click "Continue", otherwise a stray mousemove would silently
    // cancel the countdown.
    if (this.warningVisible()) return;
    const now = this.now();
    if (now - this.lastActivityStamp < IdleService.ACTIVITY_THROTTLE_MS) return;
    this.lastActivityStamp = now;
    this.lastActivity = now;
  }

  private tick() {
    if (this.timeoutMin <= 0 || !this.auth.isLoggedIn()) return;

    const timeoutSec = this.timeoutMin * 60;
    // For short limits, lead can't exceed half the window.
    const leadSec = Math.min(IdleService.WARN_LEAD_SEC, Math.floor(timeoutSec / 2));
    const idleSec = (this.now() - this.lastActivity) / 1000;
    const remaining = Math.ceil(timeoutSec - idleSec);

    // Mutating signals must happen inside the Angular zone (the tick fires
    // outside it) so the prompt re-renders.
    this.zone.run(() => {
      if (idleSec >= timeoutSec) {
        this.logoutNow(true);
      } else if (idleSec >= timeoutSec - leadSec) {
        this.countdown.set(Math.max(0, remaining));
        if (!this.warningVisible()) this.warningVisible.set(true);
      } else if (this.warningVisible()) {
        this.warningVisible.set(false);
      }
    });
  }

  private now(): number {
    return new Date().getTime();
  }
}
