import { Component, OnDestroy, OnInit } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { APP_VERSION } from '../app/version';
import { ThemeService } from './services/theme.service';
import { WebsocketService } from './services/websocket.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit, OnDestroy {
  private themeSubscription: Subscription = new Subscription();

  title: string = 'Inferno Comics';
  version: string = APP_VERSION;

  isDarkMode$: Observable<boolean>;

  webSocketConnected: boolean = true;

  constructor(private themeService: ThemeService, 
    private websocket: WebsocketService) {
      this.isDarkMode$ = this.themeService.isDarkMode$;
  }

  ngOnInit(): void {
    // Subscribe to theme changes to ensure DOM classes are applied
    this.themeSubscription = this.themeService.isDarkMode$.subscribe(isDark => {
      document.documentElement.classList.add(isDark ? 'dark-theme' : 'light-theme');
      document.documentElement.classList.remove(isDark ? 'light-theme': 'dark-theme');
    });

    this.websocket.isConnected$.subscribe((isConnected: boolean) => {
      this.webSocketConnected = isConnected;
    });
  }

  ngOnDestroy(): void {
    this.themeSubscription.unsubscribe();
  }

  toggleTheme(): void {
    this.themeService.toggleDarkMode();
  }
}