import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { SeriesService } from '../../services/series.service';
import { finalize } from 'rxjs/operators';
import { ApiResponse } from '../../models/api-response.model';
import { CommonModule, KeyValue } from '@angular/common';
import { MaterialModule } from '../../material.module';
import { FormsModule } from '@angular/forms';

export interface MissingIssue {
  id: number;
  series: {
    id: number;
    name: string;
    publisher: string;
    startYear: number;
  };
  issueNumber: string;
  expectedIssueName?: string;
  expectedCoverDate?: string;
  priority: number;
  notes?: string;
  createdAt: string;
  lastChecked: string;
}

@Component({
  selector: 'app-missing-issues',
  templateUrl: './missing-issues.component.html',
  styleUrls: ['./missing-issues.component.scss'],
  imports: [CommonModule, MaterialModule, FormsModule]
})
export class MissingIssuesComponent implements OnInit {
  issues: MissingIssue[] = [];
  filteredIssues: MissingIssue[] = [];
  loading = false;
  filter = '';
  groupBySeries = true;
  
  displayedColumns: string[] = ['series', 'issueNumber', 'expectedName', 'coverDate', 'actions'];

  constructor(
    private seriesService: SeriesService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadMissingIssues();
  }

  loadMissingIssues(): void {
    this.loading = true;
    this.seriesService.getMissingIssues()
      .pipe(finalize(() => {
        this.loading = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (response: ApiResponse<MissingIssue[]>) => {
          this.issues = response.data || [];
          this.applyFilter();
        },
        error: (error: Error) => {
          console.error('Error loading missing issues:', error);
          this.issues = [];
          this.applyFilter();
        }
      });
  }

  applyFilter(): void {
    const term = this.filter?.trim().toLowerCase();
    if (!term) {
      this.filteredIssues = [...this.issues];
    } else {
      this.filteredIssues = this.issues.filter(issue =>
        issue.series.name.toLowerCase().includes(term) ||
        issue.issueNumber.toLowerCase().includes(term) ||
        (issue.expectedIssueName || '').toLowerCase().includes(term) ||
        (issue.notes || '').toLowerCase().includes(term) ||
        (issue.series.publisher || '').toLowerCase().includes(term)
      );
    }
    this.cdr.markForCheck();
  }

  onFilterChange(): void {
    this.applyFilter();
  }

  getGroupedIssues(): Map<string, MissingIssue[]> {
    const grouped = new Map<string, MissingIssue[]>();
    
    this.filteredIssues.forEach(issue => {
      const key = `${issue.series.name} (${issue.series.startYear})`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(issue);
    });

    // Sort issues within each group by issue number
    grouped.forEach(issues => {
      issues.sort((a, b) => {
        const numA = parseFloat(a.issueNumber) || 0;
        const numB = parseFloat(b.issueNumber) || 0;
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
    return item.id;
  }

    trackBySeriesName(_index: number, item: KeyValue<string, MissingIssue[]>): string {
    return item.key;
    }
}