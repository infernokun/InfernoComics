import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../material.module';
import { FormsModule } from '@angular/forms';
import { trigger, transition, style, animate } from '@angular/animations';
import { MatPaginator } from '@angular/material/paginator';
import { Subject, takeUntil } from 'rxjs';
import { Series } from '../../models/series.model';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SeriesService } from '../../services/series.service';

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
  pageSize: number = 3;
  pageIndex: number = 0;
  totalSeries: number = 0;

  pageSizeOptions: number[] = [3, 6, 9, 15, 18, 50, 100];

  // Core data
  series: Series[] = [];
  filteredSeries: Series[] = [];
  displaySeries: Series[] = [];
  loading: boolean = true;
  searchTerm: string = '';

  // Enhanced features
  favoriteSeriesIds: Set<number> = new Set();
  viewMode: ViewMode = 'grid';

  // Sorting functionality
  currentSortOption: SortOption = 'name';
  currentSortDirection: SortDirection = 'asc';

  // Sort options for dropdown
  sortOptions = [
    { value: 'name', label: 'Series Name', icon: 'sort_by_alpha' },
    { value: 'publisher', label: 'Publisher', icon: 'business' },
    { value: 'year', label: 'Start Year', icon: 'calendar_today' },
    { value: 'completion', label: 'Completion %', icon: 'pie_chart' },
    { value: 'issueCount', label: 'Issue Count', icon: 'library_books' },
    { value: 'dateAdded', label: 'Date Added', icon: 'schedule' },
  ];

  // Filter options
  showCompletedOnly: boolean = false;
  selectedPublisher: string = '';
  publishers: string[] = [];

  private destroy$: Subject<void> = new Subject<void>();

  constructor(
    private seriesService: SeriesService,
    private router: Router,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.loadSeries();
  }

  loadSeries(): void {
    this.loading = true;
    this.seriesService.getAllSeries()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.series = data;
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading series:', error);
          this.snackBar.open('Error loading series', 'Close', { duration: 3000 });
          this.loading = false;
        }
      });
  }

  ngOnDestroy(): void {}
}
