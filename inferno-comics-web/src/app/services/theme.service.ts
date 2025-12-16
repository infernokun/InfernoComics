import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private darkModeSubject = new BehaviorSubject<boolean>(true); // Default to dark mode
  public isDarkMode$ = this.darkModeSubject.asObservable();

  constructor() {
    this.initializeTheme();
  }

  private initializeTheme(): void {
    // Check if user has a saved preference, otherwise default to dark mode
    const savedTheme = localStorage.getItem('comic-app-theme');
    const isDark = savedTheme ? savedTheme === 'dark' : true; // Default to dark

    // Set the initial theme
    this.darkModeSubject.next(isDark);
    this.applyTheme(isDark);
  }

  toggleDarkMode(): void {
    const newMode = !this.darkModeSubject.value;
    this.setDarkMode(newMode);
  }

  setDarkMode(isDark: boolean): void {
    this.darkModeSubject.next(isDark);
    this.applyTheme(isDark);
    localStorage.setItem('comic-app-theme', isDark ? 'dark' : 'light');
  }

  private applyTheme(isDark: boolean): void {
    const root = document.documentElement;

    if (isDark) {
      root.classList.add('dark-theme');
      root.classList.remove('light-theme');
    } else {
      root.classList.add('light-theme');
      root.classList.remove('dark-theme');
    }

    // Force a repaint
    root.style.display = 'none';
    root.offsetHeight;
    root.style.display = '';
  }

  get isDarkMode(): boolean {
    return this.darkModeSubject.value;
  }
}
