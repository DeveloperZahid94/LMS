import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) {
    router.navigate(['/login']);
    return false;
  }
  // Students are confined to their check-in kiosk — keep them out of the admin app.
  if (auth.user()?.role === 'STUDENT') {
    router.navigate(['/checkin']);
    return false;
  }
  return true;
};
