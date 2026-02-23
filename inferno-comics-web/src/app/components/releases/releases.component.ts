import { Component, OnInit, ChangeDetectionStrategy, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { trigger, transition, style, animate } from '@angular/animations';
import { SeriesService } from '../../services/series.service';
import { finalize } from 'rxjs/operators';
import { ApiResponse } from '../../models/api-response.model';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../material.module';
import { FormsModule } from '@angular/forms';
import { Series, SeriesWithIssues } from '../../models/series.model';
import { MissingIssue } from '../../models/missing-issue.model';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';
import { DateUtils } from '../../utils/date-utils';

interface MonthGroup {
  key: string;
  label: string;
  year: number;
  month: number;
  issues: MissingIssue[];
}

@Component({
  selector: 'app-releases',
  templateUrl: './releases.component.html',
  styleUrls: ['./releases.component.scss'],
  standalone: true,
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
export class ReleasesComponent implements OnInit {
  DateUtils = DateUtils;

  readonly series = signal<Series[]>([]);
  readonly issues = signal<MissingIssue[]>([]);
  readonly ownedComicVineIds = signal<Set<string>>(new Set());
  readonly loading = signal(true);
  readonly filter = signal('');
  readonly selectedMonths = signal(3);
  readonly collapsedMonths = signal<Set<string>>(new Set());

  readonly monthOptions = [1, 2, 3, 6, 12];

  readonly filteredIssues = computed(() => {
    const term = this.filter()?.trim().toLowerCase();
    const allIssues = this.issues();

    if (!term) return [...allIssues];

    return allIssues.filter(issue => {
      const s = issue.series;
      return (
        (s?.name?.toLowerCase().includes(term) || false) ||
        (issue.issueNumber?.toLowerCase().includes(term) || false) ||
        (issue.expectedIssueName?.toLowerCase().includes(term) || false) ||
        (s?.publisher?.toLowerCase().includes(term) || false)
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

  loadSeries(): void {
    this.seriesService.getSeriesWithIssues().subscribe({
      next: (res: ApiResponse<SeriesWithIssues[]>) => {
        if (!res.data) return;
        this.series.set(res.data.map(swi => new Series(swi.series)));
        const owned = new Set<string>();
        res.data.forEach(swi => swi.issues?.forEach(issue => {
          if (issue.comicVineId) owned.add(issue.comicVineId);
        }));
        this.ownedComicVineIds.set(owned);
        this.loadNewReleases();
      },
      error: (err: Error) => console.error('Error loading series:', err)
    });
  }

  isIssueOwned(issue: MissingIssue): boolean {
    return !!issue.comicVineId && this.ownedComicVineIds().has(issue.comicVineId);
  }

  loadNewReleases(): void {
    this.loading.set(true);
    this.seriesService.getNewReleases(this.selectedMonths())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res: ApiResponse<MissingIssue[]>) => {
          let releases = res.data || [];

          releases = releases.map(issue => {
            const copy = { ...issue };
            if (issue.seriesId && this.series().length > 0) {
              copy.series = this.series().find(s => s.id === issue.seriesId) || undefined;
            }
            return new MissingIssue(copy);
          });

          this.issues.set(releases);
        },
        error: (err: Error) => {
          console.error('Error loading new releases:', err);
          this.issues.set([]);
        }
      });
  }

  onMonthsChange(): void {
    this.loadNewReleases();
  }

  clearFilter(): void {
    this.filter.set('');
  }

  getSeriesCount(): number {
    const ids = new Set<number>();
    this.issues().forEach(issue => {
      if (issue.seriesId) ids.add(issue.seriesId);
    });
    return ids.size;
  }

  getCurrentMonthCount(): number {
    const now = new Date();
    return this.issues().filter(issue => {
      if (!issue.expectedCoverDate) return false;
      const d = new Date(issue.expectedCoverDate);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }

  getUpcomingCount(): number {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return this.issues().filter(issue => {
      if (!issue.expectedCoverDate) return false;
      return new Date(issue.expectedCoverDate) >= now;
    }).length;
  }

  getMonthGroups(): MonthGroup[] {
    const grouped = new Map<string, MissingIssue[]>();
    const meta = new Map<string, { year: number; month: number; label: string }>();

    this.filteredIssues().forEach(issue => {
      if (!issue.expectedCoverDate) return;
      const d = new Date(issue.expectedCoverDate);
      const year = d.getFullYear();
      const month = d.getMonth();
      const key = `${year}-${String(month + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      if (!grouped.has(key)) {
        grouped.set(key, []);
        meta.set(key, { year, month, label });
      }
      grouped.get(key)!.push(issue);
    });

    const groups: MonthGroup[] = [];
    grouped.forEach((issues, key) => {
      const m = meta.get(key)!;
      groups.push({ key, label: m.label, year: m.year, month: m.month, issues });
    });

    // Sort descending (most recent first)
    groups.sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month);

    return groups;
  }

  isMonthCollapsed(key: string): boolean {
    return this.collapsedMonths().has(key);
  }

  toggleMonth(key: string): void {
    const current = new Set(this.collapsedMonths());
    if (current.has(key)) {
      current.delete(key);
    } else {
      current.add(key);
    }
    this.collapsedMonths.set(current);
  }

  navigateToSeries(series: Series | undefined): void {
    if (series?.id) {
      this.router.navigate(['/series', series.id]);
    }
  }

  isCurrentMonth(group: MonthGroup): boolean {
    const now = new Date();
    return group.year === now.getFullYear() && group.month === now.getMonth();
  }

  trackByKey(_index: number, group: MonthGroup): string {
    return group.key;
  }

  trackById(_index: number, item: MissingIssue): number {
    return item.id!;
  }
}
