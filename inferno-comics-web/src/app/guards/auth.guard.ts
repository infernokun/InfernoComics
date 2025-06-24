import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Observable, of } from 'rxjs';
import { map, catchError, tap, switchMap } from 'rxjs/operators';

export const authGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
): Observable<boolean> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  console.log('Auth guard checking access to:', state.url);

  return authService.isAuthenticated().pipe(
    map((isAuthenticated: boolean) => {
      if (isAuthenticated) {
        console.log('Auth guard: User is authenticated, allowing access');
        return true;
      } else {
        console.log('Auth guard: User not authenticated, redirecting to login');
        // Store the attempted URL for redirect after login
        sessionStorage.setItem('redirectUrl', state.url);
        router.navigate(['/']);
        return false;
      }
    }),
    catchError((error) => {
      console.error('Auth guard: Error during authentication check', error);
      // On error, redirect to login
      sessionStorage.setItem('redirectUrl', state.url);
      router.navigate(['/']);
      return of(false);
    }),
    tap((result) => {
      console.log('Auth guard result for', state.url, ':', result);
    })
  );
};

export const homeAuthGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
): Observable<boolean> => {
  const authService = inject(AuthService);

  console.log('homeAuthGuard: checking authentication for:', state.url);

  return authService.isAuthenticated().pipe(
    map((isAuthenticated: boolean) => {
      console.log('homeAuthGuard: User authenticated =', isAuthenticated);
      // Always return true - allow access regardless of authentication status
      return true;
    }),
    catchError((error) => {
      console.error('homeAuthGuard: Error during authentication check', error);
      // Even on error, allow access
      return of(true);
    }),
    tap((result) => {
      console.log('homeAuthGuard result for', state.url, ':', result);
    })
  );
};

// Role-based guard for specific roles
export const roleGuard = (requiredRole: string): CanActivateFn => {
  return (route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> => {
    const authService = inject(AuthService);
    const router = inject(Router);

    console.log('Role guard checking for role:', requiredRole);

    return authService.isAuthenticated().pipe(
      switchMap((isAuthenticated: boolean) => {
        if (!isAuthenticated) {
          console.log('Role guard: User not authenticated');
          sessionStorage.setItem('redirectUrl', state.url);
          router.navigate(['/']);
          return of(false);
        }

        // Check if user has the required role - use switchMap since hasRole returns Observable
        return authService.hasRole(requiredRole).pipe(
          map((hasRole: boolean) => {
            if (hasRole) {
              console.log('Role guard: User has required role', requiredRole);
              return true;
            } else {
              console.log('Role guard: User lacks required role', requiredRole);
              router.navigate(['/unauthorized']); // or wherever you want to redirect
              return false;
            }
          })
        );
      }),
      catchError((error) => {
        console.error('Role guard: Error during role check', error);
        router.navigate(['/']);
        return of(false);
      })
    );
  };
};

// Admin guard (shorthand for admin role)
export const adminGuard: CanActivateFn = roleGuard('ADMIN');