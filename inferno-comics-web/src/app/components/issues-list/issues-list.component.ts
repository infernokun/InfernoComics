import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../material.module';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, finalize, debounceTime } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SeriesService, SeriesWithIssues } from '../../services/series.service';
import { Issue } from '../../models/issue.model';
import { EnvironmentService } from '../../services/environment.service';

interface SeriesDisplayState {
  seriesId: number;
  showAll: boolean;
}

@Component({
  selector: 'app-issues-list',
  templateUrl: './issues-list.component.html',
  styleUrls: ['./issues-list.component.scss'],
  imports: [CommonModule, MaterialModule, FormsModule, RouterModule]
})
export class IssuesListComponent implements OnInit, OnDestroy {
  loading = true;
  seriesWithIssues: SeriesWithIssues[] = [];
  uploadedPhotos = false;
  
  // Show more/less configuration
  readonly DEFAULT_ISSUE_LIMIT = 12; // Show 12 issues by default
  private seriesDisplayStates = new Map<number, boolean>(); // Track which series are expanded
  
  private readonly destroy$ = new Subject<void>();
  private readonly placeholderImage = 'assets/placeholder-comic.jpg';
  private readonly imageCache = new Map<string, string>();
  
  // Local storage keys
  private readonly STORAGE_KEYS = {
    UPLOADED_PHOTOS: 'comicApp_uploadedPhotosToggle',
    SERIES_DISPLAY_STATES: 'comicApp_seriesDisplayStates',
    DEFAULT_LIMIT: 'comicApp_defaultIssueLimit'
  };

  constructor(
    private readonly seriesService: SeriesService,
    private readonly snackBar: MatSnackBar,
    private readonly environmentService: EnvironmentService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadUserPreferences();
    this.loadSeriesWithIssues();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Loads all series with their associated issues
   */
  private loadSeriesWithIssues(): void {
    this.loading = true;
    this.seriesService
      .getSeriesWithIssues()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.loading = false)
      )
      .subscribe({
        next: (data: SeriesWithIssues[]) => {
          this.seriesWithIssues = data;
          this.showSuccessMessage(`Loaded ${this.getTotalIssuesCount()} issues from ${data.length} series`);
        },
        error: (err) => {
          console.error('Error loading series with issues:', err);
          this.showError('Failed to load series. Please try again.');
        }
      });
  }

  /**
   * Loads all user preferences from local storage
   */
  private loadUserPreferences(): void {
    // Load uploaded photos toggle preference
    const savedPhotosPreference = localStorage.getItem(this.STORAGE_KEYS.UPLOADED_PHOTOS);
    if (savedPhotosPreference !== null) {
      this.uploadedPhotos = savedPhotosPreference === 'true';
    }
    
    // Load series display states (which series are expanded)
    const savedDisplayStates = localStorage.getItem(this.STORAGE_KEYS.SERIES_DISPLAY_STATES);
    if (savedDisplayStates) {
      try {
        const states: SeriesDisplayState[] = JSON.parse(savedDisplayStates);
        states.forEach(state => {
          this.seriesDisplayStates.set(state.seriesId, state.showAll);
        });
      } catch (error) {
        console.error('Error parsing series display states:', error);
      }
    }
  }

  /**
   * Saves the uploaded photos toggle preference to local storage
   */
  private saveTogglePreference(): void {
    localStorage.setItem(this.STORAGE_KEYS.UPLOADED_PHOTOS, String(this.uploadedPhotos));
  }
  
  /**
   * Saves series display states to local storage
   */
  private saveSeriesDisplayStates(): void {
    const states: SeriesDisplayState[] = Array.from(this.seriesDisplayStates.entries())
      .map(([seriesId, showAll]) => ({ seriesId, showAll }));
    localStorage.setItem(this.STORAGE_KEYS.SERIES_DISPLAY_STATES, JSON.stringify(states));
  }

  /**
   * TrackBy function for series to optimize ngFor rendering
   */
  trackBySeriesId(_index: number, item: SeriesWithIssues): number {
    return item.series.id!;
  }

  /**
   * TrackBy function for issues to optimize ngFor rendering
   */
  trackByIssueId(_index: number, issue: Issue): number {
    return issue.id!;
  }

  /**
   * Gets the appropriate image URL based on toggle state
   */
  getImageUrl(issue: Issue): string {
    const cacheKey = `${issue.id}-${this.uploadedPhotos}`;
    
    if (this.imageCache.has(cacheKey)) {
      return this.imageCache.get(cacheKey)!;
    }

    let url: string;
    if (this.uploadedPhotos && issue.uploadedImageUrl) {
      url = this.buildUploadedImageUrl(issue.uploadedImageUrl);
    } else {
      url = issue.imageUrl || this.placeholderImage;
    }

    this.imageCache.set(cacheKey, url);
    return url;
  }

  /**
   * Constructs the full URL for uploaded images
   */
  private buildUploadedImageUrl(imageUrl: string): string {
    const baseUrl = this.environmentService.settings?.restUrl;
    return baseUrl ? `${baseUrl}/progress/image/${imageUrl}` : this.placeholderImage;
  }

  /**
   * Handles image loading errors by falling back to placeholder
   */
  onImageError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    if (imgElement.src !== this.placeholderImage) {
      imgElement.src = this.placeholderImage;
    }
  }

  /**
   * Gets the issues to display for a series (limited or all)
   */
  getDisplayedIssues(series: SeriesWithIssues): Issue[] {
    if (!series.issues || series.issues.length === 0) {
      return [];
    }
    
    const showAll = this.isSeriesExpanded(series.series.id!);
    return showAll ? series.issues : series.issues.slice(0, this.DEFAULT_ISSUE_LIMIT);
  }
  
  /**
   * Checks if a series is expanded (showing all issues)
   */
  isSeriesExpanded(seriesId: number): boolean {
    return this.seriesDisplayStates.get(seriesId) ?? false;
  }
  
  /**
   * Checks if a series has more issues than the default limit
   */
  hasMoreIssues(series: SeriesWithIssues): boolean {
    return (series.issues?.length || 0) > this.DEFAULT_ISSUE_LIMIT;
  }
  
  /**
   * Gets the count of hidden issues for a series
   */
  getHiddenIssuesCount(series: SeriesWithIssues): number {
    const total = series.issues?.length || 0;
    return Math.max(0, total - this.DEFAULT_ISSUE_LIMIT);
  }
  
  /**
   * Toggles the show more/less state for a series
   */
  toggleSeriesExpansion(seriesId: number): void {
    const currentState = this.seriesDisplayStates.get(seriesId) ?? false;
    this.seriesDisplayStates.set(seriesId, !currentState);
    this.saveSeriesDisplayStates();
    this.cdr.markForCheck();
    
    const action = !currentState ? 'Showing all issues' : 'Showing fewer issues';
    this.snackBar.open(action, undefined, {
      duration: 1500,
      horizontalPosition: 'center',
      verticalPosition: 'bottom'
    });
  }
  
  /**
   * Expands all series to show all issues
   */
  expandAllSeries(): void {
    this.seriesWithIssues.forEach(series => {
      if (series.series.id && this.hasMoreIssues(series)) {
        this.seriesDisplayStates.set(series.series.id, true);
      }
    });
    this.saveSeriesDisplayStates();
    this.cdr.markForCheck();
    
    this.snackBar.open('All series expanded', undefined, {
      duration: 2000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom'
    });
  }
  
  /**
   * Collapses all series to show limited issues
   */
  collapseAllSeries(): void {
    this.seriesDisplayStates.clear();
    this.saveSeriesDisplayStates();
    this.cdr.markForCheck();
    
    this.snackBar.open('All series collapsed', undefined, {
      duration: 2000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom'
    });
  }

  /**
   * Checks if a series has any issues
   */
  hasIssues(series: SeriesWithIssues): boolean {
    return series.issues?.length > 0;
  }

  /**
   * Gets the total count of all issues across all series
   */
  private getTotalIssuesCount(): number {
    return this.seriesWithIssues.reduce((total, series) => 
      total + (series.issues?.length || 0), 0
    );
  }

  /**
   * Shows error message to user
   */
  private showError(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 5000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
      panelClass: ['error-snackbar']
    });
  }

  /**
   * Shows success message to user
   */
  private showSuccessMessage(message: string): void {
    this.snackBar.open(message, 'Dismiss', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
      panelClass: ['success-snackbar']
    });
  }

  /**
   * Handles toggle change event
   */
  onToggleChange(): void {
    this.saveTogglePreference();
    this.imageCache.clear(); // Clear cache when toggle changes
    
    const photoType = this.uploadedPhotos ? 'uploaded' : 'original';
    this.snackBar.open(`Showing ${photoType} photos`, undefined, {
      duration: 2000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom'
    });
  }

  /**
   * Refreshes the series list
   */
  refresh(): void {
    this.imageCache.clear();
    this.loadSeriesWithIssues();
  }
}