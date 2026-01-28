import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, finalize } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { trigger, transition, style, animate } from '@angular/animations';
import { MaterialModule } from '../../../material.module';
import { ApiResponse } from '../../../models/api-response.model';
import { Issue } from '../../../models/issue.model';
import { generateSlug, Series, SeriesWithIssues } from '../../../models/series.model';
import { RecognitionService } from '../../../services/recognition.service';
import { SeriesService } from '../../../services/series.service';
import { DateUtils } from '../../../utils/date-utils';

@Component({
  selector: 'app-issues-list',
  templateUrl: './issues-list.component.html',
  styleUrls: ['./issues-list.component.scss'],
  imports: [MaterialModule, FormsModule, RouterModule],
  animations: [
    trigger('slideInUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(20px)' }),
        animate('0.4s ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ]),
    trigger('expandCollapse', [
      transition(':enter', [
        style({ height: '0', opacity: 0, overflow: 'hidden' }),
        animate('0.3s ease-out', style({ height: '*', opacity: 1 }))
      ]),
      transition(':leave', [
        style({ height: '*', opacity: 1, overflow: 'hidden' }),
        animate('0.25s ease-in', style({ height: '0', opacity: 0 }))
      ])
    ])
  ]
})
export class IssuesListComponent implements OnInit, OnDestroy {
  loading = true;
  uploadedPhotos = false;

  seriesWithIssues: SeriesWithIssues[] = [];
  seriesWithoutIssues: SeriesWithIssues[] = [];

  latestIssue: Issue | undefined = undefined;
  recentIssues: Issue[] = [];

  private readonly RECENT_ISSUES_LIMIT = 5;
  
  private seriesShowAllStates = new Map<number, boolean>(); // Track show more/less per series
  private seriesCollapsedStates = new Map<number, boolean>(); // Track collapsed/expanded per series
  
  private readonly DEFAULT_ISSUE_LIMIT = 9;
  private readonly destroy$ = new Subject<void>();
  private readonly placeholderImage = 'assets/placeholder-comic.jpg';
  private readonly imageCache = new Map<string, string>();
  
  private readonly STORAGE_KEYS = {
    UPLOADED_PHOTOS: 'comicApp_uploadedPhotosToggle',
    SERIES_SHOW_ALL_STATES: 'comicApp_seriesShowAllStates',
    SERIES_COLLAPSED_STATES: 'comicApp_seriesCollapsedStates'
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

          const allIssues = this.seriesWithIssues
            .flatMap(series => series.issues.map(issue => {
              issue.series = series.series;
              return issue;
            }));

          // Sort by createdAt descending and get recent issues
          const sortedIssues = [...allIssues]
            .filter(issue => issue.createdAt)
            .sort((a, b) => {
              const dateA = new Date(a.createdAt!).getTime();
              const dateB = new Date(b.createdAt!).getTime();
              return dateB - dateA;
            });

          this.latestIssue = sortedIssues[0];
          this.recentIssues = sortedIssues.slice(1, this.RECENT_ISSUES_LIMIT + 1);
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

    // Load show all states (which series show all issues vs limited)
    const savedShowAllStates = localStorage.getItem(this.STORAGE_KEYS.SERIES_SHOW_ALL_STATES);
    if (savedShowAllStates) {
      try {
        const states: Array<{ seriesId: number; showAll: boolean }> = JSON.parse(savedShowAllStates);
        states.forEach(state => {
          this.seriesShowAllStates.set(state.seriesId, state.showAll);
        });
      } catch (error) {
        console.error('Error parsing series show all states:', error);
      }
    }

    // Load collapsed states (which series are collapsed to title only)
    const savedCollapsedStates = localStorage.getItem(this.STORAGE_KEYS.SERIES_COLLAPSED_STATES);
    if (savedCollapsedStates) {
      try {
        const states: Array<{ seriesId: number; collapsed: boolean }> = JSON.parse(savedCollapsedStates);
        states.forEach(state => {
          this.seriesCollapsedStates.set(state.seriesId, state.collapsed);
        });
      } catch (error) {
        console.error('Error parsing series collapsed states:', error);
      }
    }
  }

  private saveTogglePreference(): void {
    localStorage.setItem(this.STORAGE_KEYS.UPLOADED_PHOTOS, String(this.uploadedPhotos));
  }

  private saveShowAllStates(): void {
    const states = Array.from(this.seriesShowAllStates.entries())
      .map(([seriesId, showAll]) => ({ seriesId, showAll }));
    localStorage.setItem(this.STORAGE_KEYS.SERIES_SHOW_ALL_STATES, JSON.stringify(states));
  }

  private saveCollapsedStates(): void {
    const states = Array.from(this.seriesCollapsedStates.entries())
      .map(([seriesId, collapsed]) => ({ seriesId, collapsed }));
    localStorage.setItem(this.STORAGE_KEYS.SERIES_COLLAPSED_STATES, JSON.stringify(states));
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

    return this.isShowingAllIssues(series.series.id!) ? series.issues : series.issues.slice(0, this.DEFAULT_ISSUE_LIMIT);
  }

  // Show More/Less - controls how many issues are displayed
  isShowingAllIssues(seriesId: number): boolean {
    return this.seriesShowAllStates.get(seriesId) ?? false;
  }

  hasMoreIssues(series: SeriesWithIssues): boolean {
    return (series.issues?.length || 0) > this.DEFAULT_ISSUE_LIMIT;
  }

  getHiddenIssuesCount(series: SeriesWithIssues): number {
    const total = series.issues?.length || 0;
    return Math.max(0, total - this.DEFAULT_ISSUE_LIMIT);
  }

  toggleShowMore(seriesId: number): void {
    const currentState = this.seriesShowAllStates.get(seriesId) ?? false;
    this.seriesShowAllStates.set(seriesId, !currentState);
    this.saveShowAllStates();
    this.cdr.markForCheck();
  }

  // Expand/Collapse - controls whether content is visible (title only vs full card)
  isSeriesCollapsed(seriesId: number): boolean {
    return this.seriesCollapsedStates.get(seriesId) ?? false;
  }

  toggleSeriesCollapsed(seriesId: number): void {
    const currentState = this.seriesCollapsedStates.get(seriesId) ?? false;
    this.seriesCollapsedStates.set(seriesId, !currentState);
    this.saveCollapsedStates();
    this.cdr.markForCheck();
  }

  expandAllSeries(): void {
    this.seriesWithIssues.forEach(series => {
      if (series.series.id) {
        this.seriesCollapsedStates.set(series.series.id, false);
      }
    });
    this.saveCollapsedStates();
    this.cdr.markForCheck();
  }

  collapseAllSeries(): void {
    this.seriesWithIssues.forEach(series => {
      if (series.series.id) {
        this.seriesCollapsedStates.set(series.series.id, true);
      }
    });
    this.saveCollapsedStates();
    this.cdr.markForCheck();
  }

  hasIssues(series: SeriesWithIssues): boolean {
    return series.issues?.length > 0;
  }

  getTotalIssues(): number {
    return this.seriesWithIssues.reduce((total, series) =>
      total + (series.issues?.length || 0), 0
    );
  }

  getAverageIssuesPerSeries(): string {
    if (this.seriesWithIssues.length === 0) return '0';
    const avg = this.getTotalIssues() / this.seriesWithIssues.length;
    return avg.toFixed(1);
  }

  getRecentIssuesCount(): number {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    return this.seriesWithIssues
      .flatMap(series => series.issues)
      .filter(issue => {
        if (!issue.createdAt) return false;
        const createdDate = new Date(issue.createdAt);
        return createdDate >= oneWeekAgo;
      }).length;
  }

  getRelativeTime(date: Date | string | number[] | undefined): string {
    if (!date) return '';

    let parsedDate: Date;
    if (Array.isArray(date)) {
      parsedDate = this.parseDateTimeArray(date);
    } else if (date instanceof Date) {
      parsedDate = date;
    } else {
      parsedDate = new Date(date);
    }

    if (isNaN(parsedDate.getTime())) return '';

    const now = new Date();
    const diffMs = now.getTime() - parsedDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return this.formatDateTime(parsedDate);
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