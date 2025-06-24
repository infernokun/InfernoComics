import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, take, filter, timeout } from 'rxjs/operators';
import { Router } from '@angular/router';
import { User } from '../models/user.model';
import { ApiResponse } from '../models/api-response.model';
import { LoginResponse } from '../models/dto/login-response.model';
import { LoginService } from './login.service';
import { UserService } from './user.service';

export interface UserPayload {
  user: User;
  accessToken: string;
  refreshToken: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService implements OnDestroy {
  private payloadSubject: BehaviorSubject<UserPayload | undefined> = new BehaviorSubject<UserPayload | undefined>(undefined);
  public payload$: Observable<UserPayload | undefined> = this.payloadSubject.asObservable();

  private userSubject: BehaviorSubject<User | undefined> = new BehaviorSubject<User | undefined>(undefined);
  public user$: Observable<User | undefined> = this.userSubject.asObservable();

  private loadingSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  public loading$: Observable<boolean> = this.loadingSubject.asObservable();

  // Add refresh state management
  private isRefreshing = false;
  private refreshTokenSubject: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);

  // Token storage keys
  private readonly ACCESS_TOKEN_KEY = 'accessToken';
  private readonly REFRESH_TOKEN_KEY = 'refreshToken';
  private readonly TOKEN_REFRESH_BUFFER = 2 * 60 * 1000; // 2 minutes before expiry

  private lastActivityTime: number = Date.now();
  private refreshCheckInterval: any;
  private readonly ACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes
  private readonly REFRESH_CHECK_INTERVAL = 60 * 1000; // Check every minute when active

  constructor(
    private loginService: LoginService,
    private router: Router,
    private userService: UserService
  ) {
    this.startSmartTokenRefresh();
    this.trackUserActivity();
  }

  ngOnDestroy(): void {
    if (this.refreshCheckInterval) {
      clearInterval(this.refreshCheckInterval);
    }
  }

  private startSmartTokenRefresh(): void {
    console.log('Starting smart token refresh system');

    this.refreshCheckInterval = setInterval(() => {
      this.checkTokenRefreshNeeded();
    }, this.REFRESH_CHECK_INTERVAL);
  }

  private checkTokenRefreshNeeded(): void {
    // Only check if user has been active recently
    const timeSinceActivity = Date.now() - this.lastActivityTime;
    if (timeSinceActivity > this.ACTIVITY_TIMEOUT) {
      console.log('User inactive for', Math.floor(timeSinceActivity / 1000 / 60), 'minutes, skipping token check');
      return;
    }

    // Only check if page is visible (not a background tab)
    if (document.hidden) {
      console.log('Page is hidden, skipping token check');
      return;
    }

    const accessToken = this.getStoredAccessToken();
    if (!accessToken) {
      return;
    }

    const decodedToken = this.decodeToken(accessToken);
    if (!decodedToken) {
      return;
    }

    // Only refresh if close to expiry AND user is active
    if (this.isTokenCloseToExpiry(decodedToken) && !this.isRefreshing) {
      console.log('Proactive token refresh triggered (user active)');
      this.performTokenRefresh().subscribe({
        next: (success) => console.log('Proactive refresh result:', success),
        error: (error) => console.error('Proactive refresh failed:', error)
      });
    }
  }

  private trackUserActivity(): void {
    // Track user activity to determine if they're actively using the app
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

    const updateActivity = () => {
      this.lastActivityTime = Date.now();
    };

    // Add throttling to avoid excessive updates
    let throttleTimer: any;
    const throttledUpdate = () => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        updateActivity();
        throttleTimer = null;
      }, 30000); // Update at most once per 30 seconds
    };

    activityEvents.forEach(event => {
      document.addEventListener(event, throttledUpdate, true);
    });
  }

  isAuthenticated(): Observable<boolean> {
    const accessToken = this.getStoredAccessToken();
    const refreshToken = this.getStoredRefreshToken();

    // No tokens at all
    if (!accessToken && !refreshToken) {
      console.log('No access or refresh token found');
      this.clearAuthState();
      return of(false);
    }

    // Have refresh token but no access token - try to refresh
    if (!accessToken && refreshToken) {
      console.log('No access token, attempting refresh...');
      return this.performTokenRefresh();
    }

    // Have access token - validate it
    const decodedToken = this.decodeToken(accessToken!);
    if (!decodedToken || !this.isTokenStructureValid(decodedToken)) {
      console.log('Invalid access token structure');
      this.clearAuthState();
      return of(false);
    }

    // Check if access token is expired
    if (this.isTokenExpired(decodedToken)) {
      console.log('Access token expired, attempting refresh...');
      return this.performTokenRefresh();
    }

    console.log('Access token valid, setting up auth state...');
    return this.setupAuthFromValidToken(accessToken!, decodedToken);
  }

  setPayload(user: User, accessToken: string, refreshToken: string): void {
    const payload: Readonly<UserPayload> = {
      user: user,
      accessToken: accessToken,
      refreshToken: refreshToken
    };

    this.payloadSubject.next(payload);
    this.userSubject.next(user);
    this.storeTokens(accessToken, refreshToken);
    this.setLoading(false);
  }

  setLoading(loading: boolean): void {
    this.loadingSubject.next(loading);
  }

  decodeToken(token: string): any {
    try {
      if (!token || token.split('.').length !== 3) {
        return null;
      }
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload;
    } catch (error) {
      console.warn('Failed to decode token:', error);
      return null;
    }
  }

  private isTokenStructureValid(decodedToken: any): boolean {
    return decodedToken &&
      typeof decodedToken.exp === 'number' &&
      typeof decodedToken.sub === 'string' &&
      decodedToken.exp > 0;
  }

  private isTokenExpired(decodedToken: any): boolean {
    return decodedToken.exp * 1000 <= Date.now();
  }

  isTokenCloseToExpiry(decodedToken: any): boolean {
    const currentTime = Date.now();
    const expiryTime = decodedToken.exp * 1000;
    const timeUntilExpiry = expiryTime - currentTime;

    console.log('Time until expiry (minutes):', timeUntilExpiry / (1000 * 60));

    return timeUntilExpiry <= this.TOKEN_REFRESH_BUFFER;
  }

  private setupAuthFromValidToken(accessToken: string, decodedToken: any): Observable<boolean> {
    const refreshToken = this.getStoredRefreshToken();
    if (!refreshToken) {
      console.log('Missing refresh token');
      this.clearAuthState();
      return of(false);
    }

    // Always fetch full user object from server using ID in token
    console.log('Fetching full user data from server for user ID:', decodedToken.sub);
    return this.userService.getUserById(decodedToken.sub).pipe(
      map((user: User | undefined) => {
        if (!user) {
          console.log('User not found on server for ID:', decodedToken.sub);
          this.clearAuthState();
          return false;
        }
        console.log('Full user data retrieved:', user);
        this.setPayload(user, accessToken, refreshToken);
        return true;
      }),
      catchError((error) => this.handleAuthError('Failed to fetch user', error))
    );
  }

  performTokenRefresh(): Observable<boolean> {
    const refreshToken = this.getStoredRefreshToken();
    if (!refreshToken) {
      console.log('No refresh token available');
      this.clearAuthState();
      return of(false);
    }

    if (this.isRefreshing) {
      return this.refreshTokenSubject.pipe(
        filter(newToken => newToken !== null),
        take(1),
        map(newToken => !!newToken)
      );
    }

    this.isRefreshing = true;
    this.refreshTokenSubject.next(null);
    this.setLoading(true);

    return this.loginService.refreshToken(refreshToken).pipe(
      map((response: ApiResponse<LoginResponse>) => {
        if (!response?.data?.accessToken || !response?.data?.refreshToken) {
          throw new Error('Invalid refresh response');
        }

        const newAccessToken = response.data.accessToken;
        const newRefreshToken = response.data.refreshToken;

        const decodedToken = this.decodeToken(newAccessToken);
        if (!decodedToken || !this.isTokenStructureValid(decodedToken)) {
          throw new Error('Invalid refreshed access token');
        }

        // Use the user data from the refresh response instead of making another API call
        const user = response.data.user;
        if (!user) {
          throw new Error('User data missing from refresh response');
        }

        console.log('Token refreshed, using user data from response:', user);
        this.setPayload(user, newAccessToken, newRefreshToken);
        this.refreshTokenSubject.next(newAccessToken);
        this.isRefreshing = false;

        console.log('Token refreshed successfully');
        return true;
      }),
      catchError((error) => {
        this.isRefreshing = false;
        this.refreshTokenSubject.next(null);
        return this.handleAuthError('Token refresh failed', error);
      })
    );
  }

  logout(): void {
    this.setLoading(true);

    const refreshToken = this.getStoredRefreshToken();
    if (refreshToken) {
      // Attempt server-side logout with refresh token
      this.loginService.logout(refreshToken).pipe(
        timeout(5000),
        catchError((error) => {
          console.warn('Server logout failed, proceeding with local logout:', error);
          return of(null);
        })
      ).subscribe(() => {
        this.performLogout();
      });
    } else {
      this.performLogout();
    }
  }

  private performLogout(): void {
    this.clearAuthState();
    this.router.navigate(['/login']);
    console.log('Logout completed');
  }

  private clearAuthState(): void {
    this.removeStoredTokens();
    this.payloadSubject.next(undefined);
    this.userSubject.next(undefined);
    this.setLoading(false);
    this.isRefreshing = false;
    this.refreshTokenSubject.next(null);
  }

  private handleAuthError(message: string, error?: any): Observable<boolean> {
    console.error(`Auth error: ${message}`, error);
    this.clearAuthState();
    return of(false);
  }

  setUser(user: User): void {
    const currentUser = this.userSubject.value;
    if (currentUser?.id === user.id) {
      this.userSubject.next(user);

      // Update payload with new user data while keeping the same tokens
      const currentPayload = this.payloadSubject.value;
      if (currentPayload) {
        this.payloadSubject.next({
          ...currentPayload,
          user: user
        });
      }
    }
  }

  getUser(): User | undefined {
    return this.userSubject.value;
  }

  // Helper methods for token storage
  private getStoredAccessToken(): string | null {
    return localStorage.getItem(this.ACCESS_TOKEN_KEY);
  }

  private getStoredRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  private storeTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem(this.ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(this.REFRESH_TOKEN_KEY, refreshToken);
  }

  private removeStoredTokens(): void {
    localStorage.removeItem(this.ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
  }

  // Public method to get current access token (for HTTP interceptors)
  public getAccessToken(): string | null {
    return this.getStoredAccessToken();
  }

  // Public method to manually refresh token
  public forceTokenRefresh(): Observable<boolean> {
    return this.performTokenRefresh();
  }

  // Check if user has specific role
  public hasRole(role: string): Observable<boolean> {
    return this.payload$.pipe(
      map(payload => {
        if (!payload?.accessToken) return false;
        const decodedToken = this.decodeToken(payload.accessToken);
        const roles = decodedToken?.roles || '';
        return roles.split(' ').includes(`ROLE_${role}`);
      })
    );
  }
}
