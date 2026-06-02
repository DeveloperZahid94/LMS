import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

/** Gate the check-in kiosk: only logged-in STUDENT accounts. */
export const studentGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) {
    router.navigate(['/student-login']);
    return false;
  }
  if (auth.user()?.role !== 'STUDENT') {
    router.navigate(['/dashboard']);
    return false;
  }
  return true;
};
