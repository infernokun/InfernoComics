import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { User } from './models/user.model';
import { Observable, Subject, takeUntil, map, startWith, combineLatest, distinctUntilChanged, shareReplay, filter } from 'rxjs';
import { AuthService } from './services/auth.service';
import { EditDialogService } from './services/edit-dialog.service';
import { Role } from './enums/role.enum';
import { AppInitService } from './services/app-init.service';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';

declare var require: any;
const { version: appVersion } = require('../../package.json');

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'Project Amaterasu';
  header: string = 'UNCLASSIFIED';
  footer: string = 'UNCLASSIFIED';
  appVersion: any = appVersion;
  bannerDisplayStyle: string = 'green-white';

  // Combined loading states
  loggedInUser$: Observable<User | undefined>;
  isAuthLoading$: Observable<boolean>;
  isAppReady$: Observable<boolean>;
  showAuthButtons$: Observable<boolean>;
  Role = Role;

  initializationComplete$: Observable<boolean> | undefined;

  private unsubscribe$ = new Subject<void>();

  constructor(
    private authService: AuthService,
    private dialogService: EditDialogService,
    private appInitService: AppInitService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.loggedInUser$ = this.authService.user$;
    this.initializationComplete$ = this.appInitService.initializationComplete$;

    // Auth loading state - true when checking authentication
    this.isAuthLoading$ = combineLatest([
      this.authService.loading$,
      this.appInitService.isInitialized()
    ]).pipe(
      map(([authLoading, appInitialized]) => authLoading || !appInitialized),
      startWith(true) // Start with loading = true
    );

    // App ready when initialization is complete AND auth check is done
    this.isAppReady$ = combineLatest([
      this.initializationComplete$.pipe(
        map(() => true),
        distinctUntilChanged(),
        shareReplay(1),
        startWith(false)
      ),
      this.isAuthLoading$
    ]).pipe(
      map(([initComplete, authLoading]) => initComplete && !authLoading)
    );

    // Only show auth buttons when app is ready AND user is not authenticated
    this.showAuthButtons$ = combineLatest([
      this.isAppReady$,
      this.loggedInUser$
    ]).pipe(
      map(([appReady, user]) => appReady && !user)
    );
  }

  ngOnInit(): void {
    // Remove the explicit checkAuthentication() call
    // Let the AuthService handle authentication automatically
    console.log('AppComponent initialized - AuthService will handle authentication');

    this.authService.user$.pipe(
      takeUntil(this.unsubscribe$)
    ).subscribe((user) => {
      if (user) {
        console.log('User logged in:', user.username);
      } else {
        console.log('No user logged in', user);
      }
    });
  }

  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  private triggerChangeDetection() {
    this.cdr.markForCheck();
  }

  // Remove the checkAuthentication method entirely
  // The AuthService constructor handles this automatically

  openLoginModal(): void {
    this.dialogService.openLoginDialog().subscribe((res: any) => {
      // Handle login result if needed
    });
  }

  openRegisterModal(): void {
    this.dialogService.openRegisterDialog().subscribe((res: any) => {
      // Handle register result if needed
    });
  }

  openProfileModal() {
    console.log("WIP");
  }

  openUserSettingsModal() {
    console.log("WIP");
  }

  logoutButton(): void {
    this.authService.logout();
  }
}
