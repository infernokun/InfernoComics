import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, finalize } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MaterialModule } from '../../../material.module';
import { ApiResponse } from '../../../models/api-response.model';
import { Issue } from '../../../models/issue.model';
import { generateSlug, Series, SeriesWithIssues } from '../../../models/series.model';
import { RecognitionService } from '../../../services/recognition.service';
import { SeriesService } from '../../../services/series.service';
import { DateUtils } from '../../../utils/date-utils';

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
  uploadedPhotos = false;

  seriesWithIssues: SeriesWithIssues[] = [];
  seriesWithoutIssues: SeriesWithIssues[] = [];

  latestIssue: Issue | undefined = undefined;
  
  private seriesDisplayStates = new Map<number, boolean>(); // Track which series are expanded
  
  private readonly DEFAULT_ISSUE_LIMIT = 9;
  private readonly destroy$ = new Subject<void>();
  private readonly placeholderImage = 'assets/placeholder-comic.jpg';
  private readonly imageCache = new Map<string, string>();
  
  private readonly STORAGE_KEYS = {
    UPLOADED_PHOTOS: 'comicApp_uploadedPhotosToggle',
    SERIES_DISPLAY_STATES: 'comicApp_seriesDisplayStates',
    DEFAULT_LIMIT: 'comicApp_defaultIssueLimit'
  };

  formatDateTime = DateUtils.formatDateTime;
  parseDateTimeArray = DateUtils.parseDateTimeArray;

  constructor(
    private readonly router: Router,
    private readonly snackBar: MatSnackBar,
    private readonly cdr: ChangeDetectorRef,
    private readonly seriesService: SeriesService,
    private readonly recognitionService: RecognitionService
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
        next: (res: ApiResponse<SeriesWithIssues[]>) => {
          if (!res.data) throw new Error('Failed to load series with issues: no data returned');

        this.seriesWithIssues = res.data
          .map((s: SeriesWithIssues) => {
            const series = new Series(s.series);
            const issues = s.issues.map((i: Issue) => new Issue(i));
            return {
              series,
              issues
            };
          })
          .filter((s: SeriesWithIssues) => s.issues.length > 0);

          this.seriesWithoutIssues = res.data.filter((s: SeriesWithIssues) => s.issues.length === 0);

          this.latestIssue = this.seriesWithIssues
            .flatMap(series => series.issues.map(issue => {
              issue.series = series.series;
              return issue;
            }))
            .reduce((latestIssue: Issue | undefined, issue: Issue) => {
              if (!issue.createdAt) return latestIssue;

              if (!latestIssue || issue.createdAt > latestIssue.createdAt!) {
                return issue;
              }
              return latestIssue;
            }, undefined);
        },
        error: (err: Error) => {
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
    
    return this.isSeriesExpanded(series.series.id!) ? series.issues : series.issues.slice(0, this.DEFAULT_ISSUE_LIMIT);
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
  }
  
  expandAllSeries(): void {
    this.seriesWithIssues.forEach(series => {
      if (series.series.id && this.hasMoreIssues(series)) {
        this.seriesDisplayStates.set(series.series.id, true);
      }
    });
    this.saveSeriesDisplayStates();
    this.cdr.markForCheck();
  }
  
  collapseAllSeries(): void {
    this.seriesDisplayStates.clear();
    this.saveSeriesDisplayStates();
    this.cdr.markForCheck();
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
  }

  refresh(): void {
    this.imageCache.clear();
    this.loadSeriesWithIssues();
  }
  
  navigateToSeries(series: SeriesWithIssues, event?: Event): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }

    this.router.navigate(['/series', series.series.id, generateSlug(series.series.name)]);
  }
}