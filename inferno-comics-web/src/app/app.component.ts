// src/app/app.component.ts
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ThemeService } from './services/theme.service';
import { Observable, Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: false
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'Comic Book Collection';
  isDarkMode$: Observable<boolean>;
  private themeSubscription: Subscription = new Subscription();

  constructor(private themeService: ThemeService) {
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
  }

  ngOnDestroy(): void {
    this.themeSubscription.unsubscribe();
  }

  toggleTheme(): void {
    this.themeService.toggleDarkMode();
  }
}