import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../material.module';
import { FormsModule } from '@angular/forms';
import { trigger, transition, style, animate } from '@angular/animations';
import { MatPaginator } from '@angular/material/paginator';
import { Subject, takeUntil } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SeriesService, SeriesWithIssues } from '../../services/series.service';
import { Issue } from '../../models/issue.model';

type SortOption =
  | 'name'
  | 'publisher'
  | 'year'
  | 'completion'
  | 'issueCount'
  | 'dateAdded';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'grid' | 'list';

@Component({
  selector: 'app-issues-list',
  templateUrl: './issues-list.component.html',
  styleUrls: ['./issues-list.component.scss'],
  imports: [CommonModule, MaterialModule, FormsModule, RouterModule],
  animations: [
    trigger('fadeInUp', [
      transition(':enter', [
        style({ transform: 'translateY(30px)', opacity: 0 }),
        animate(
          '400ms ease-out',
          style({ transform: 'translateY(0)', opacity: 1 })
        ),
      ]),
    ]),
    trigger('slideInUp', [
      transition(':enter', [
        style({ transform: 'translateY(20px)', opacity: 0 }),
        animate(
          '300ms ease-out',
          style({ transform: 'translateY(0)', opacity: 1 })
        ),
      ]),
    ]),
    trigger('cardAnimation', [
      transition(':enter', [
        style({ transform: 'scale(0.95) translateY(20px)', opacity: 0 }),
        animate(
          '350ms ease-out',
          style({ transform: 'scale(1) translateY(0)', opacity: 1 })
        ),
      ]),
    ]),
  ],
})
export class IssuesListComponent implements OnInit, OnDestroy {
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  loading = true;
  seriesWithIssues: SeriesWithIssues[] = [];

  private destroy$ = new Subject<void>();

  constructor(private seriesService: SeriesService,private snackBar: MatSnackBar) {}

  ngOnInit(): void {
    this.loadSeriesWithIssues();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadSeriesWithIssues(): void {
    this.loading = true;
    this.seriesService.getSeriesWithIssues()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: SeriesWithIssues[]) => {
          this.seriesWithIssues = data;
          console.log('data', this.seriesWithIssues);
          this.loading = false;
        },
        error: (err) => {
          console.error('Error loading series with issues:', err);
          this.snackBar.open('Error loading series', 'Close', {
            duration: 3000,
          });
          this.loading = false;
        },
      });
  }

  trackBySeriesId(_: number, swi: SeriesWithIssues) {
    return swi.series.id;
  }

  trackByIssueId(_: number, issue: Issue) {
    return issue.id;
  }
}