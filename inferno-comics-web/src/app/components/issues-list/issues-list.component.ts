import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { RouterModule } from '@angular/router';

import { MaterialModule } from '../../material.module';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, finalize, debounceTime } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Issue } from '../../models/issue.model';
import { EnvironmentService } from '../../services/environment/environment.service';
import { SeriesWithIssues } from '../../models/series.model';
import { RecognitionService } from '../../services/recognition/recognition.service';
import { SeriesService } from '../../services/series/series.service';

interface SeriesDisplayState {
  seriesId: number;
  showAll: boolean;
}

@Component({
  selector: 'app-issues-list',
  templateUrl: './issues-list.component.html',
  styleUrls: ['./issues-list.component.scss'],
  imports: [MaterialModule, FormsModule, RouterModule]
})
export class IssuesListComponent implements OnInit, OnDestroy {
  loading = true;
  seriesWithIssues: SeriesWithIssues[] = [];
  uploadedPhotos = false;
  
  readonly DEFAULT_ISSUE_LIMIT = 12;
  private seriesDisplayStates = new Map<number, boolean>(); // Track which series are expanded
  
  private readonly destroy$ = new Subject<void>();
  private readonly placeholderImage = 'assets/placeholder-comic.jpg';
  private readonly imageCache = new Map<string, string>();
  
  private readonly STORAGE_KEYS = {
    UPLOADED_PHOTOS: 'comicApp_uploadedPhotosToggle',
    SERIES_DISPLAY_STATES: 'comicApp_seriesDisplayStates',
    DEFAULT_LIMIT: 'comicApp_defaultIssueLimit'
  };

  constructor(
    private readonly seriesService: SeriesService,
    private readonly recognitionService: RecognitionService,
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

  private loadUserPreferences(): void {
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

  private saveTogglePreference(): void {
    localStorage.setItem(this.STORAGE_KEYS.UPLOADED_PHOTOS, String(this.uploadedPhotos));
  }
  
  private saveSeriesDisplayStates(): void {
    const states: SeriesDisplayState[] = Array.from(this.seriesDisplayStates.entries())
      .map(([seriesId, showAll]) => ({ seriesId, showAll }));
    localStorage.setItem(this.STORAGE_KEYS.SERIES_DISPLAY_STATES, JSON.stringify(states));
  }

  trackBySeriesId(_index: number, item: SeriesWithIssues): number {
    return item.series.id!;
  }

  trackByIssueId(_index: number, issue: Issue): number {
    return issue.id!;
  }

  getImageUrl(issue: Issue): string {
    const cacheKey = `${issue.id}-${this.uploadedPhotos}`;
    
    if (this.imageCache.has(cacheKey)) {
      return this.imageCache.get(cacheKey)!;
    }

    let url: string;
    if (this.uploadedPhotos && issue.uploadedImageUrl) {
      url = this.buildUploadedImageUrl(issue);
    } else {
      url = issue.imageUrl || this.placeholderImage;
    }

    this.imageCache.set(cacheKey, url);
    return url;
  }

  private buildUploadedImageUrl(issue: Issue): string {
    return this.recognitionService.getCurrentImageUrl({ issue: issue });
  }

  onImageError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    if (imgElement.src !== this.placeholderImage) {
      imgElement.src = this.placeholderImage;
    }
  }

  getDisplayedIssues(series: SeriesWithIssues): Issue[] {
    if (!series.issues || series.issues.length === 0) {
      return [];
    }
    
    const showAll = this.isSeriesExpanded(series.series.id!);
    return showAll ? series.issues : series.issues.slice(0, this.DEFAULT_ISSUE_LIMIT);
  }
  
  isSeriesExpanded(seriesId: number): boolean {
    return this.seriesDisplayStates.get(seriesId) ?? false;
  }
  
  hasMoreIssues(series: SeriesWithIssues): boolean {
    return (series.issues?.length || 0) > this.DEFAULT_ISSUE_LIMIT;
  }
  
  getHiddenIssuesCount(series: SeriesWithIssues): number {
    const total = series.issues?.length || 0;
    return Math.max(0, total - this.DEFAULT_ISSUE_LIMIT);
  }
  
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

  hasIssues(series: SeriesWithIssues): boolean {
    return series.issues?.length > 0;
  }

  private getTotalIssuesCount(): number {
    return this.seriesWithIssues.reduce((total, series) => 
      total + (series.issues?.length || 0), 0
    );
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 5000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
      panelClass: ['error-snackbar']
    });
  }

  private showSuccessMessage(message: string): void {
    this.snackBar.open(message, 'Dismiss', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
      panelClass: ['success-snackbar']
    });
  }

  onToggleChange(): void {
    this.saveTogglePreference();
    this.imageCache.clear();
    
    const photoType = this.uploadedPhotos ? 'uploaded' : 'original';
    this.snackBar.open(`Showing ${photoType} photos`, undefined, {
      duration: 2000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom'
    });
  }

  refresh(): void {
    this.imageCache.clear();
    this.loadSeriesWithIssues();
  }
}