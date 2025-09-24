import { Component, OnInit, OnDestroy } from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SeriesService } from '../../services/series.service';
import { IssueService } from '../../services/issue.service';
import { Series } from '../../models/series.model';
import { SeriesListComponent } from '../series-list/series-list.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MaterialModule } from '../../material.module';

interface PublisherStat {
  name: string;
  count: number;
  percentage: number;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  animations: [
    trigger('fadeInUp', [
      transition(':enter', [
        style({ transform: 'translateY(30px)', opacity: 0 }),
        animate('600ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
      ])
    ]),
    trigger('slideInUp', [
      transition(':enter', [
        style({ transform: 'translateY(50px)', opacity: 0 }),
        animate('400ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
      ])
    ]),
    trigger('scaleIn', [
      transition(':enter', [
        style({ transform: 'scale(0.8)', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'scale(1)', opacity: 1 }))
      ])
    ]),
    trigger('cardAnimation', [
      transition(':enter', [
        style({ transform: 'scale(0.9) translateY(20px)', opacity: 0 }),
        animate('400ms ease-out', style({ transform: 'scale(1) translateY(0)', opacity: 1 }))
      ])
    ])
  ],
  imports: [CommonModule, MaterialModule, FormsModule, RouterModule, SeriesListComponent]
})
export class DashboardComponent implements OnInit, OnDestroy {
  // Core data
  totalSeries = 0;
  totalIssues = 0;
  allSeries: Series[] = [];
  loading = true;
  
  // Enhanced features
  uniquePublishers = 0;
  favoritePublisher = '';
  publisherStats: PublisherStat[] = [];
  showAllPublishers = false;
  
  // Completion tracking
  completedSeriesCount = 0;
  completionPercentage = 0;
  
  // Series display
  favoriteSeriesIds: Set<number> = new Set();
  viewMode: 'grid' | 'list' = 'grid';
  
  private destroy$ = new Subject<void>();

  constructor(
    private seriesService: SeriesService,
    private issueService: IssueService
  ) {
    // Load saved preferences
    this.loadUserPreferences();
  }

  ngOnInit(): void {
    this.loadDashboardData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Data Loading
  loadDashboardData(): void {
    this.loading = true;
    
    // Load all series
    this.seriesService.getAllSeries()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (series) => {
          this.totalSeries = series.length;
          // Sort all series by name
          this.allSeries = series.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          this.calculatePublisherStats(series);
          this.calculateCompletionStats(series);
        },
        error: (error) => console.error('Error loading series:', error)
      });

    // Load all issues
    this.issueService.getAllIssues()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (issues) => {
          this.totalIssues = issues.length;
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading issues:', error);
          this.loading = false;
        }
      });
  }

  refreshData(): void {
    this.loadDashboardData();
  }

  // Publisher Statistics
  private calculatePublisherStats(series: Series[]): void {
    const publisherCount = new Map<string, number>();
    
    series.forEach(s => {
      const publisher = s.publisher || 'Unknown';
      publisherCount.set(publisher, (publisherCount.get(publisher) || 0) + 1);
    });
    
    this.uniquePublishers = publisherCount.size;
    
    this.publisherStats = Array.from(publisherCount.entries())
      .map(([name, count]) => ({
        name,
        count,
        percentage: (count / series.length) * 100
      }))
      .sort((a, b) => b.count - a.count);
    
    this.favoritePublisher = this.publisherStats[0]?.name || '';
  }

  // Completion Statistics
  private calculateCompletionStats(series: Series[]): void {
    const seriesWithIssues = series.filter(s => 
      (s.issuesAvailableCount || 0) > 0
    );
    
    this.completedSeriesCount = seriesWithIssues.filter(s => 
      this.isSeriesComplete(s)
    ).length;
    
    this.completionPercentage = seriesWithIssues.length > 0 
      ? Math.round((this.completedSeriesCount / seriesWithIssues.length) * 100)
      : 0;
  }

  // Series Completion Logic
  isSeriesComplete(series: Series): boolean {
    const owned = series.issuesOwnedCount || 0;
    const available = series.issuesAvailableCount || 0;
    
    return available > 0 && owned === available;
  }

  getCompletionPercentage(series: Series): number {
    const owned = series.issuesOwnedCount || 0;
    const available = series.issuesAvailableCount || 0;
    
    if (available === 0) return 0;
    return Math.round((owned / available) * 100);
  }

  toggleView(): void {
    this.viewMode = this.viewMode === 'grid' ? 'list' : 'grid';
    this.saveUserPreferences();
  }

  // Favorites Management
  toggleFavorite(series: Series, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    
    if (series.id) {
      if (this.favoriteSeriesIds.has(series.id)) {
        this.favoriteSeriesIds.delete(series.id);
      } else {
        this.favoriteSeriesIds.add(series.id);
      }
      this.saveUserPreferences();
    }
  }

  isFavorited(seriesId: number | undefined): boolean {
    return seriesId ? this.favoriteSeriesIds.has(seriesId) : false;
  }

  trackBySeries(index: number, series: Series): any {
    return series.id;
  }

  // User Preferences
  private loadUserPreferences(): void {
    const preferences = localStorage.getItem('dashboardPreferences');
    if (preferences) {
      const prefs = JSON.parse(preferences);
      this.viewMode = prefs.viewMode || 'grid';
      this.favoriteSeriesIds = new Set(prefs.favoriteSeriesIds || []);
    }
  }

  private saveUserPreferences(): void {
    const preferences = {
      viewMode: this.viewMode,
      favoriteSeriesIds: Array.from(this.favoriteSeriesIds)
    };
    localStorage.setItem('dashboardPreferences', JSON.stringify(preferences));
  }
}