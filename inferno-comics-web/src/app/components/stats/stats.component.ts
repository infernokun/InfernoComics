import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, takeUntil, finalize } from 'rxjs';
import { trigger, transition, style, animate, stagger, query } from '@angular/animations';
import { RouterModule } from '@angular/router';
import { MaterialModule } from '../../material.module';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';
import { ApiResponse } from '../../models/api-response.model';
import { DateUtils } from '../../utils/date-utils';
import {
  StatsService,
  CollectionStats,
  PublisherBreakdownItem,
  GrowthPoint,
  SeriesCompletionItem,
  NewestSeriesItem,
  NewestIssueItem,
  SeriesIssueCount,
} from '../../services/stats.service';
import { generateSlug } from '../../models/series.model';

@Component({
  selector: 'app-stats',
  templateUrl: './stats.component.html',
  styleUrls: ['./stats.component.scss'],
  imports: [MaterialModule, RouterModule, NgxSkeletonLoaderModule],
  animations: [
    trigger('fadeInUp', [
      transition(':enter', [
        style({ transform: 'translateY(30px)', opacity: 0 }),
        animate('500ms ease-out', style({ transform: 'translateY(0)', opacity: 1 })),
      ]),
    ]),
    trigger('slideInUp', [
      transition(':enter', [
        style({ transform: 'translateY(20px)', opacity: 0 }),
        animate('400ms ease-out', style({ transform: 'translateY(0)', opacity: 1 })),
      ]),
    ]),
    trigger('scaleIn', [
      transition(':enter', [
        style({ transform: 'scale(0.9)', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'scale(1)', opacity: 1 })),
      ]),
    ]),
    trigger('staggerCards', [
      transition(':enter', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(20px)' }),
          stagger(80, [
            animate('400ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
          ]),
        ], { optional: true }),
      ]),
    ]),
  ],
})
export class StatsComponent implements OnInit, OnDestroy {
  loading = true;
  stats: CollectionStats | null = null;

  private readonly destroy$ = new Subject<void>();

  formatDateTime = DateUtils.formatDateTime;
  parseDateTimeArray = DateUtils.parseDateTimeArray;

  // Expose Math for template usage
  Math = Math;

  // Chart color palette
  readonly chartColors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16',
    '#6366f1', '#d946ef',
  ];

  readonly conditionOrder = [
    'MINT', 'NEAR_MINT', 'VERY_FINE', 'FINE', 'VERY_GOOD', 'GOOD', 'FAIR', 'POOR'
  ];

  readonly conditionLabels: Record<string, string> = {
    'MINT': 'Mint',
    'NEAR_MINT': 'Near Mint',
    'VERY_FINE': 'Very Fine',
    'FINE': 'Fine',
    'VERY_GOOD': 'Very Good',
    'GOOD': 'Good',
    'FAIR': 'Fair',
    'POOR': 'Poor',
  };

  readonly conditionColors: Record<string, string> = {
    'MINT': '#10b981',
    'NEAR_MINT': '#34d399',
    'VERY_FINE': '#3b82f6',
    'FINE': '#60a5fa',
    'VERY_GOOD': '#f59e0b',
    'GOOD': '#fbbf24',
    'FAIR': '#f97316',
    'POOR': '#ef4444',
  };

  constructor(private readonly statsService: StatsService) {}

  ngOnInit(): void {
    this.loadStats();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadStats(): void {
    this.loading = true;
    this.statsService
      .getCollectionStats()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => (this.loading = false))
      )
      .subscribe({
        next: (res: ApiResponse<CollectionStats>) => {
          if (res.data) {
            this.stats = res.data;
          }
        },
        error: (err: Error) => {
          console.error('Error loading collection stats:', err);
        },
      });
  }

  refresh(): void {
    this.loadStats();
  }

  // --- Publisher Donut Chart ---

  getPublisherDonutStyle(): string {
    if (!this.stats?.publisherBreakdown?.length) return 'conic-gradient(var(--border-color) 0deg 360deg)';

    const publishers = this.stats.publisherBreakdown;
    const total = publishers.reduce((sum, p) => sum + p.seriesCount, 0);
    if (total === 0) return 'conic-gradient(var(--border-color) 0deg 360deg)';

    const segments: string[] = [];
    let currentAngle = 0;

    publishers.forEach((pub, i) => {
      const angle = (pub.seriesCount / total) * 360;
      const color = this.chartColors[i % this.chartColors.length];
      segments.push(`${color} ${currentAngle}deg ${currentAngle + angle}deg`);
      currentAngle += angle;
    });

    return `conic-gradient(${segments.join(', ')})`;
  }

  getTopPublishers(): PublisherBreakdownItem[] {
    return this.stats?.publisherBreakdown?.slice(0, 8) ?? [];
  }

  // --- Condition Bar Chart ---

  getOrderedConditions(): { key: string; label: string; count: number; color: string; percentage: number }[] {
    if (!this.stats?.conditionBreakdown) return [];

    const total = Object.values(this.stats.conditionBreakdown).reduce((sum, count) => sum + count, 0);
    const maxCount = Math.max(...Object.values(this.stats.conditionBreakdown));

    return this.conditionOrder
      .filter(c => this.stats!.conditionBreakdown[c] != null)
      .map(c => ({
        key: c,
        label: this.conditionLabels[c] || c,
        count: this.stats!.conditionBreakdown[c],
        color: this.conditionColors[c] || '#6b7280',
        percentage: maxCount > 0 ? (this.stats!.conditionBreakdown[c] / maxCount) * 100 : 0,
      }));
  }

  // --- Decade Bar Chart ---

  getDecadeData(): { decade: string; count: number; percentage: number }[] {
    if (!this.stats?.decadeBreakdown) return [];

    const entries = Object.entries(this.stats.decadeBreakdown).sort(([a], [b]) => a.localeCompare(b));
    const maxCount = Math.max(...entries.map(([, c]) => c));

    return entries.map(([decade, count]) => ({
      decade,
      count,
      percentage: maxCount > 0 ? (count / maxCount) * 100 : 0,
    }));
  }

  // --- Growth Chart ---

  getGrowthData(): GrowthPoint[] {
    return this.stats?.collectionGrowth ?? [];
  }

  getMaxCumulative(): number {
    const data = this.getGrowthData();
    return data.length ? Math.max(...data.map(d => d.cumulative)) : 1;
  }

  getMaxAdded(): number {
    const data = this.getGrowthData();
    return data.length ? Math.max(...data.map(d => d.added)) : 1;
  }

  getGrowthBarHeight(point: GrowthPoint): number {
    const max = this.getMaxAdded();
    return max > 0 ? (point.added / max) * 100 : 0;
  }

  getGrowthLinePoints(): string {
    const data = this.getGrowthData();
    if (data.length < 2) return '';
    const maxC = this.getMaxCumulative();
    const width = 100;
    const height = 100;

    return data
      .map((d, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - (d.cumulative / maxC) * height;
        return `${x},${y}`;
      })
      .join(' ');
  }

  shouldShowGrowthLabel(index: number): boolean {
    const data = this.getGrowthData();
    if (data.length <= 1) return true;
    if (index === 0 || index === data.length - 1) return true;
    const step = Math.ceil(data.length / 6);
    return step > 0 && index % step === 0;
  }

  formatMonth(month: string): string {
    const [year, m] = month.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(m, 10) - 1]} '${year.slice(2)}`;
  }

  // --- Top Series ---

  getTopSeries(): SeriesIssueCount[] {
    return this.stats?.topSeriesByIssueCount ?? [];
  }

  getTopSeriesMaxCount(): number {
    const data = this.getTopSeries();
    return data.length ? Math.max(...data.map(d => d.count)) : 1;
  }

  // --- Completion ---

  getTopCompletionSeries(): SeriesCompletionItem[] {
    return this.stats?.completionStats?.topSeriesCompletion ?? [];
  }

  // --- Newest Series ---

  getNewestSeries(): NewestSeriesItem[] {
    return this.stats?.newestSeries ?? [];
  }

  // --- Newest Issues ---

  getNewestIssues(): NewestIssueItem[] {
    return this.stats?.newestIssues ?? [];
  }

  // --- Read Stats Donut ---

  getReadDonutStyle(): string {
    if (!this.stats?.readStats) return 'conic-gradient(var(--border-color) 0deg 360deg)';
    const { read, unread } = this.stats.readStats;
    const total = read + unread;
    if (total === 0) return 'conic-gradient(var(--border-color) 0deg 360deg)';

    const readAngle = (read / total) * 360;
    return `conic-gradient(#10b981 0deg ${readAngle}deg, #6b7280 ${readAngle}deg 360deg)`;
  }

  // --- Value ---

  formatCurrency(value: number | undefined): string {
    if (value == null) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  getProfitLossClass(): string {
    if (!this.stats?.valueAnalysis) return '';
    return this.stats.valueAnalysis.profitLoss >= 0 ? 'profit' : 'loss';
  }

  // --- Relative time ---

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

  getSeriesLink(series: NewestSeriesItem): string[] {
    return ['/series', String(series.id), generateSlug(series.name)];
  }
}
