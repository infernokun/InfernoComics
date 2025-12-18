import { Component, OnInit, ChangeDetectionStrategy, signal, computed, effect } from '@angular/core';
import { SeriesService } from '../../services/series.service';
import { finalize } from 'rxjs/operators';
import { ApiResponse } from '../../models/api-response.model';
import { CommonModule, KeyValue } from '@angular/common';
import { MaterialModule } from '../../material.module';
import { FormsModule } from '@angular/forms';
import { Series } from '../../models/series.model';
import { MissingIssue } from '../../models/missing-issue.model';
import { DateUtils } from '../../utils/date-utils';

@Component({
  selector: 'app-missing-issues',
  templateUrl: './missing-issues.component.html',
  styleUrls: ['./missing-issues.component.scss'],
  imports: [CommonModule, MaterialModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MissingIssuesComponent implements OnInit {
  DateUtils = DateUtils;

  // Signals
  readonly series = signal<Series[]>([]);
  readonly issues = signal<MissingIssue[]>([]);
  readonly loading = signal(true);
  readonly filter = signal('');
  
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
  
  readonly displayedColumns: string[] = ['series', 'issueNumber', 'expectedName', 'coverDate', 'actions'];
  
  constructor(private seriesService: SeriesService) {
    effect(() => {
      this.filteredIssues();
    });
  }
  
  ngOnInit(): void {
    this.loadSeries();
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
  
  onReload(): void {
    this.loadMissingIssues();
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
  
  trackById(_index: number, item: MissingIssue): number {
    return item.id!;
  }
  
  trackBySeriesName(_index: number, item: KeyValue<string, MissingIssue[]>): string {
    return item.key;
  }
}