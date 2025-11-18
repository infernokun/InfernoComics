import { Component, OnDestroy, OnInit } from '@angular/core';
import { ThemeService } from './services/theme.service';
import { Observable, Subscription } from 'rxjs';

import { APP_VERSION } from '../app/version';
import { WebsocketService } from './services/websocket.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'Inferno Comics';
  version: string = APP_VERSION;
  isDarkMode$: Observable<boolean>;
  private themeSubscription: Subscription = new Subscription();

  webSocketConnected: boolean = true;

  constructor(private themeService: ThemeService, private websocket: WebsocketService) {
    this.isDarkMode$ = this.themeService.isDarkMode$;
  }

  ngOnInit(): void {
    // Subscribe to theme changes to ensure DOM classes are applied
    this.themeSubscription = this.themeService.isDarkMode$.subscribe(isDark => {
      // Force apply theme classes
      if (isDark) {
        document.documentElement.classList.add('dark-theme');
        document.documentElement.classList.remove('light-theme');
      } else {
        document.documentElement.classList.add('light-theme');
        document.documentElement.classList.remove('dark-theme');
      }
    });

    this.websocket.isConnected$.subscribe((isConnected: boolean) => {
      this.webSocketConnected = isConnected;
    })
  }

  ngOnDestroy(): void {
    this.themeSubscription.unsubscribe();
  }

  toggleTheme(): void {
    this.themeService.toggleDarkMode();
  }
}