import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      // A 401 from a login endpoint is "bad credentials" — the login component
      // shows that message itself, so don't treat it as session expiry.
      const isLoginCall = /\/auth\/(login|student-login|superadmin-login)/.test(req.url);
      // Only tear down + redirect when there's actually a session to lose.
      // Otherwise a stray/background 401 (e.g. a stale-token poll) would yank
      // the user off whatever public page they're on (e.g. /student-login).
      if (err.status === 401 && !isLoginCall && auth.accessToken) {
        auth.sessionExpired();
      }
      return throwError(() => err);
    }),
  );
};
