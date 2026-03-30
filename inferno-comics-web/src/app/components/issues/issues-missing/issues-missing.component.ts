import { Component, OnInit, ChangeDetectionStrategy, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { trigger, transition, style, animate } from '@angular/animations';
import { SeriesService } from '../../../services/series.service';
import { finalize } from 'rxjs/operators';
import { ApiResponse } from '../../../models/api-response.model';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../material.module';
import { FormsModule } from '@angular/forms';
import { Series } from '../../../models/series.model';
import { MissingIssue } from '../../../models/missing-issue.model';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';
import { DateUtils } from '../../../utils/date-utils';

interface SeriesGroup {
  key: string;
  series: Series | undefined;
  issues: MissingIssue[];
}

const IGNORED_STORAGE_KEY = 'inferno-missing-ignored-series';

@Component({
  selector: 'app-issues-missing',
  templateUrl: './issues-missing.component.html',
  styleUrls: ['./issues-missing.component.scss'],
  imports: [CommonModule, MaterialModule, FormsModule, NgxSkeletonLoaderModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
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
export class IssuesMissingComponent implements OnInit {
  DateUtils = DateUtils;

  // Signals
  readonly series = signal<Series[]>([]);
  readonly issues = signal<MissingIssue[]>([]);
  readonly loading = signal(true);
  readonly recalculating = signal(false);
  readonly filter = signal('');
  readonly viewMode = signal<'grid' | 'list'>('grid');
  readonly expandedCards = signal<Set<string>>(new Set()); // Cards open in grid (default: collapsed)
  readonly showMoreCards = signal<Set<string>>(new Set()); // Cards showing >5 issues
  readonly ignoredSeriesIds = signal<Set<number>>(this.loadIgnoredFromStorage());
  readonly showIgnored = signal(false);

  sortBy: 'series' | 'date' | 'count' = 'series';

  // Computed signals
  readonly filteredIssues = computed(() => {
    const term = this.filter()?.trim().toLowerCase();
    const allIssues = this.issues();

    if (!term) {
      return [...allIssues];
    }

    return allIssues.filter(issue => {
      const series = issue.series;
      return (
        (series?.name?.toLowerCase().includes(term) || false) ||
        (issue.issueNumber?.toLowerCase().includes(term) || false) ||
        (issue.expectedIssueName?.toLowerCase().includes(term) || false) ||
        (series?.publisher?.toLowerCase().includes(term) || false)
      );
    });
  });

  constructor(
    private seriesService: SeriesService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadSeries();
  }

  private loadIgnoredFromStorage(): Set<number> {
    try {
      const stored = localStorage.getItem(IGNORED_STORAGE_KEY);
      if (stored) return new Set(JSON.parse(stored) as number[]);
    } catch {}
    return new Set();
  }

  private saveIgnoredToStorage(ids: Set<number>): void {
    localStorage.setItem(IGNORED_STORAGE_KEY, JSON.stringify([...ids]));
  }

  loadSeries(): void {
    this.seriesService.getAllSeries().subscribe({
      next: (res: ApiResponse<Series[]>) => {
        if (!res.data) throw Error("error loading series");
        this.series.set(res.data);
        this.loadMissingIssues();
      },
      error: (err: Error) => {
        console.error('Error loading series:', err);
      }
    });
  }

  loadMissingIssues(): void {
    this.loading.set(true);
    this.seriesService.getMissingIssues()
      .pipe(finalize(() => {
        this.loading.set(false);
      }))
      .subscribe({
        next: (res: ApiResponse<MissingIssue[]>) => {
          let issues = res.data || [];

          issues = issues.map(issue => {
            const issueCopy = { ...issue };
            if (issue.seriesId && this.series().length > 0) {
              issueCopy.series = this.series().find(s => s.id === issue.seriesId) || undefined;
            }
            return new MissingIssue(issueCopy);
          });

          this.issues.set(issues);
        },
        error: (error: Error) => {
          console.error('Error loading missing issues:', error);
          this.issues.set([]);
        }
      });
  }

  clearFilter(): void {
    this.filter.set('');
  }

  setViewMode(mode: 'grid' | 'list'): void {
    this.viewMode.set(mode);
  }

  onSortChange(): void {
    // Triggers re-render via getSortedGroups
  }

  getSeriesCount(): number {
    const ignoredIds = this.ignoredSeriesIds();
    const seriesIds = new Set<number>();
    this.issues().forEach(issue => {
      if (issue.seriesId && !ignoredIds.has(issue.seriesId)) {
        seriesIds.add(issue.seriesId);
      }
    });
    return seriesIds.size;
  }

  getOldestMissingDate(): string {
    const issues = this.issues();
    if (issues.length === 0) return '—';

    let oldest: Date | null = null;
    issues.forEach(issue => {
      if (issue.expectedCoverDate) {
        if (!oldest || issue.expectedCoverDate < oldest) {
          oldest = issue.expectedCoverDate;
        }
      }
    });

    if (!oldest) return '—';
    return DateUtils.formatDate(oldest);
  }

  getRecentlyAddedCount(): number {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    return this.issues().filter(issue => {
      if (!issue.createdAt) return false;
      return issue.createdAt >= oneWeekAgo;
    }).length;
  }

  getGroupedIssues(): Map<string, MissingIssue[]> {
    const grouped = new Map<string, MissingIssue[]>();
    const filtered = this.filteredIssues();

    filtered.forEach(issue => {
      const series = issue.series;
      if (series) {
        const key = `${series.name} (${series.startYear})`;
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(issue);
      }
    });

    // Sort issues within each group by issue number
    grouped.forEach(issues => {
      issues.sort((a, b) => {
        const numA = parseFloat(a.issueNumber || '0') || 0;
        const numB = parseFloat(b.issueNumber || '0') || 0;
        return numA - numB;
      });
    });

    return grouped;
  }

  getSortedGroups(): SeriesGroup[] {
    const grouped = this.getGroupedIssues();
    const groups: SeriesGroup[] = [];
    const showIgnored = this.showIgnored();
    const ignoredIds = this.ignoredSeriesIds();

    grouped.forEach((issues, key) => {
      const seriesId = issues[0]?.series?.id;
      const isIgnored = seriesId ? ignoredIds.has(seriesId) : false;
      if (showIgnored ? isIgnored : !isIgnored) {
        groups.push({ key, series: issues[0]?.series, issues });
      }
    });

    switch (this.sortBy) {
      case 'series':
        groups.sort((a, b) => a.key.localeCompare(b.key));
        break;
      case 'date':
        groups.sort((a, b) => {
          const dateA = a.issues[0]?.expectedCoverDate || new Date(0);
          const dateB = b.issues[0]?.expectedCoverDate || new Date(0);
          return dateA.getTime() - dateB.getTime();
        });
        break;
      case 'count':
        groups.sort((a, b) => b.issues.length - a.issues.length);
        break;
    }

    return groups;
  }

  ignoredGroupCount(): number {
    const grouped = this.getGroupedIssues();
    const ignoredIds = this.ignoredSeriesIds();
    let count = 0;
    grouped.forEach(issues => {
      const seriesId = issues[0]?.series?.id;
      if (seriesId && ignoredIds.has(seriesId)) count++;
    });
    return count;
  }

  // Card expand/collapse — default collapsed, open on click
  isCardExpanded(key: string): boolean {
    return this.expandedCards().has(key);
  }

  toggleCard(key: string): void {
    const current = new Set(this.expandedCards());
    current.has(key) ? current.delete(key) : current.add(key);
    this.expandedCards.set(current);
  }

  expandAllCards(): void {
    const allKeys = this.getSortedGroups().map(g => g.key);
    this.expandedCards.set(new Set(allKeys));
  }

  collapseAllCards(): void {
    this.expandedCards.set(new Set());
  }

  // Show more than 5 issues within a card
  isShowingMore(key: string): boolean {
    return this.showMoreCards().has(key);
  }

  toggleShowMore(key: string): void {
    const current = new Set(this.showMoreCards());
    current.has(key) ? current.delete(key) : current.add(key);
    this.showMoreCards.set(current);
  }

  // Ignore / unignore a series
  isIgnored(seriesId: number | undefined): boolean {
    return seriesId ? this.ignoredSeriesIds().has(seriesId) : false;
  }

  toggleIgnoreSeries(seriesId: number | undefined, event: Event): void {
    event.stopPropagation();
    if (!seriesId) return;
    const current = new Set(this.ignoredSeriesIds());
    current.has(seriesId) ? current.delete(seriesId) : current.add(seriesId);
    this.ignoredSeriesIds.set(current);
    this.saveIgnoredToStorage(current);
  }

  toggleShowIgnored(): void {
    this.showIgnored.update(v => !v);
  }

  onReload(): void {
    this.loadMissingIssues();
  }

  onRecalculate(): void {
    this.recalculating.set(true);
    this.seriesService.refreshMissingIssues()
      .pipe(finalize(() => this.recalculating.set(false)))
      .subscribe({
        next: () => this.loadMissingIssues(),
        error: (err) => console.error('Error recalculating missing issues:', err)
      });
  }

  removeMissingIssue(issueId: number): void {
    if (confirm('Remove this missing issue from tracking?')) {
      this.seriesService.removeMissingIssue(issueId).subscribe({
        next: () => {
          this.loadMissingIssues();
        },
        error: (error) => {
          console.error('Error removing missing issue:', error);
        }
      });
    }
  }

  navigateToSeries(series: Series | undefined): void {
    if (series?.id) {
      this.router.navigate(['/series', series.id]);
    }
  }

  trackById(_index: number, item: MissingIssue): number {
    return item.id!;
  }
}
