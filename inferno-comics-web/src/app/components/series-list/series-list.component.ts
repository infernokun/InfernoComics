import { Component, OnInit, OnDestroy, Inject, ViewChild } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { SeriesService } from '../../services/series.service';
import { Series } from '../../models/series.model';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../material.module';
import { FormsModule } from '@angular/forms';
import { trigger, transition, style, animate } from '@angular/animations';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatPaginator, PageEvent } from '@angular/material/paginator';

type SortOption = 'name' | 'publisher' | 'year' | 'completion' | 'issueCount' | 'dateAdded';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'grid' | 'list';

@Component({
  selector: 'app-series-list',
  templateUrl: './series-list.component.html',
  styleUrls: ['./series-list.component.scss'],
  imports: [CommonModule, MaterialModule, FormsModule, RouterModule],
  animations: [
    trigger('fadeInUp', [
      transition(':enter', [
        style({ transform: 'translateY(30px)', opacity: 0 }),
        animate('400ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
      ])
    ]),
    trigger('slideInUp', [
      transition(':enter', [
        style({ transform: 'translateY(20px)', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
      ])
    ]),
    trigger('cardAnimation', [
      transition(':enter', [
        style({ transform: 'scale(0.95) translateY(20px)', opacity: 0 }),
        animate('350ms ease-out', style({ transform: 'scale(1) translateY(0)', opacity: 1 }))
      ])
    ])
  ]
})
export class SeriesListComponent implements OnInit, OnDestroy {
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
    { value: 'dateAdded', label: 'Date Added', icon: 'schedule' }
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
  ) {
    this.loadUserPreferences();
    console.log('lol', this.viewMode)
  }

  ngOnInit(): void {
    this.loadSeries();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadSeries(): void {
    this.loading = true;
    this.seriesService.getAllSeries()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.series = data;
          this.extractPublishers();
          this.updatePage();
          this.applyFiltersAndSorting();
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading series:', error);
          this.snackBar.open('Error loading series', 'Close', { duration: 3000 });
          this.loading = false;
        }
      });
  }

  updatePage(): void {
    const start = this.pageIndex * this.pageSize;
    const end   = start + this.pageSize;
    this.displaySeries = this.filteredSeries.slice(start, end);
  }

  onPageChange(event: PageEvent): void {
    this.pageSize  = event.pageSize;
    this.pageIndex = event.pageIndex;
    this.updatePage();
    this.saveUserPreferences();
  }
  
  private extractPublishers(): void {
    const publisherSet = new Set<string>();
    this.series.forEach(s => {
      if (s.publisher) {
        publisherSet.add(s.publisher);
      }
    });
    this.publishers = Array.from(publisherSet).sort();
  }

  // Search functionality
  onSearch(): void {
    this.applyFiltersAndSorting();
  }

  // Sorting methods
  onSortChange(sortOption: SortOption | string): void {
    const validSortOption = this.isValidSortOption(sortOption) ? sortOption : 'name';
    
    if (this.currentSortOption === validSortOption) {
      this.currentSortDirection = this.currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.currentSortOption = validSortOption;
      this.currentSortDirection = 'asc';
    }
    
    this.applyFiltersAndSorting();
    this.saveUserPreferences();
  }

  private isValidSortOption(value: any): value is SortOption {
    return ['name', 'publisher', 'year', 'completion', 'issueCount', 'dateAdded'].includes(value);
  }

  toggleSortDirection(): void {
    this.currentSortDirection = this.currentSortDirection === 'asc' ? 'desc' : 'asc';
    this.applyFiltersAndSorting();
    this.saveUserPreferences();
  }

  getCurrentSortDetails() {
    return this.sortOptions.find(option => option.value === this.currentSortOption);
  }

  // View mode toggle
  toggleView(): void {
    console.log(this.viewMode);
    this.viewMode = this.viewMode === 'grid' ? 'list' : 'grid';
    console.log(this.viewMode);
    this.saveUserPreferences();
  }

  // Filter methods
  onPublisherFilterChange(): void {
    this.applyFiltersAndSorting();
    this.saveUserPreferences();
  }

  onCompletionFilterChange(): void {
    this.applyFiltersAndSorting();
    this.saveUserPreferences();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.selectedPublisher = '';
    this.showCompletedOnly = false;
    this.applyFiltersAndSorting();
    this.saveUserPreferences();
  }

  private applyFiltersAndSorting(): void {
    let filtered = [...this.series];

    // Apply search filter
    if (this.searchTerm.trim()) {
      filtered = filtered.filter(s =>
        s.name!.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        (s.publisher && s.publisher.toLowerCase().includes(this.searchTerm.toLowerCase()))
      );
    }

    // Apply publisher filter
    if (this.selectedPublisher) {
      filtered = filtered.filter(s => s.publisher === this.selectedPublisher);
    }

    // Apply completion filter
    if (this.showCompletedOnly) {
      filtered = filtered.filter(s => this.isSeriesComplete(s));
    }

    // Apply sorting
    this.filteredSeries = filtered.sort((a, b) => {
      let comparison = 0;

      switch (this.currentSortOption) {
        case 'name':
          comparison = (a.name || '').localeCompare(b.name || '');
          break;

        case 'publisher':
          const pubA = a.publisher || 'Unknown';
          const pubB = b.publisher || 'Unknown';
          comparison = pubA.localeCompare(pubB);
          break;

        case 'year':
          const yearA = a.startYear || 0;
          const yearB = b.startYear || 0;
          comparison = yearA - yearB;
          break;

        case 'completion':
          const compA = this.getCompletionPercentage(a);
          const compB = this.getCompletionPercentage(b);
          comparison = compA - compB;
          break;

        case 'issueCount':
          const issuesA = a.issuesAvailableCount || 0;
          const issuesB = b.issuesAvailableCount || 0;
          comparison = issuesA - issuesB;
          break;

        case 'dateAdded':
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          comparison = dateA - dateB;
          break;

        default:
          comparison = (a.name || '').localeCompare(b.name || '');
      }

      return this.currentSortDirection === 'asc' ? comparison : -comparison;
    });

    this.pageIndex = 0;
    this.totalSeries = this.filteredSeries.length;
    this.updatePage();
  }

  // Series completion logic
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

  getCompletionStats() {
    const completed = this.series.filter(s => this.isSeriesComplete(s)).length;
    const total = this.series.filter(s => (s.issuesAvailableCount || 0) > 0).length;
    return { completed, total, percentage: total > 0 ? Math.round((completed / total) * 100) : 0 };
  }

  // Favorites management
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

  // Navigation
  viewSeries(id: number | undefined): void {
    if (id) {
      this.router.navigate(['/series', id]);
    }
  }

  deleteSeries(event: Event, id: number | undefined): void {
    event.stopPropagation();
    if (id && confirm('Are you sure you want to delete this series?')) {
      this.seriesService.deleteSeries(id).subscribe({
        next: () => {
          this.snackBar.open('Series deleted successfully', 'Close', { duration: 3000 });
          this.loadSeries();
        },
        error: (error) => {
          console.error('Error deleting series:', error);
          this.snackBar.open('Error deleting series', 'Close', { duration: 3000 });
        }
      });
    }
  }

  // Utility methods
  trackBySeries(index: number, series: Series): any {
    return series.id;
  }

  getFilteredSeriesCount(): number {
    return this.filteredSeries.length;
  }

  getTotalSeriesCount(): number {
    return this.series.length;
  }

  // User preferences
  private loadUserPreferences(): void {
    const preferences = localStorage.getItem('seriesListPreferences');
    if (preferences) {
      const prefs = JSON.parse(preferences);
      this.viewMode = prefs.viewMode || 'grid';
      this.favoriteSeriesIds = new Set(prefs.favoriteSeriesIds || []);
      this.currentSortOption = prefs.currentSortOption || 'name';
      this.currentSortDirection = prefs.currentSortDirection || 'asc';
      this.selectedPublisher = prefs.selectedPublisher || '';
      this.showCompletedOnly = prefs.showCompletedOnly || false;
      this.pageSize = prefs.pageSize || 3;
    }
  }

  private saveUserPreferences(): void {
    const preferences = {
      viewMode: this.viewMode,
      favoriteSeriesIds: Array.from(this.favoriteSeriesIds),
      currentSortOption: this.currentSortOption,
      currentSortDirection: this.currentSortDirection,
      selectedPublisher: this.selectedPublisher,
      showCompletedOnly: this.showCompletedOnly,
      pageSize: this.pageSize
    };
    localStorage.setItem('seriesListPreferences', JSON.stringify(preferences));
  }

  getFolderStructure() {
    this.seriesService.getSeriesFolderStructure().subscribe((info: any) => {
      console.log(info);
      this.openJsonDialog(info);
    });
  }

  openJsonDialog(data: any): void {
    const dialogRef = this.dialog.open(JsonDialogComponent, {
      width: '90vw',
      maxWidth: '800px',
      maxHeight: '90vh',
      data: data,
      panelClass: 'json-dialog-panel'
    });

    dialogRef.afterClosed().subscribe(result => {
      console.log('Dialog closed');
    });
  }

    syncAllSeries() {
    this.seriesService.syncAllSeries().subscribe((data: any) => {
      console.log('sync', data);
    })
  }
}

@Component({
  selector: 'app-json-dialog',
  template: `
    <div class="json-dialog">
      <h2 mat-dialog-title>Series Folder Structure</h2>
      
      <mat-dialog-content class="dialog-content">
        <div class="json-container">
          <pre class="json-display">{{ formatJson(data) }}</pre>
        </div>
      </mat-dialog-content>
      
      <mat-dialog-actions align="end">
        <button mat-button (click)="copyToClipboard()" color="primary">
          <mat-icon>content_copy</mat-icon>
          Copy JSON
        </button>
        <button mat-button (click)="close()" color="primary">
          Close
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .json-dialog {
      width: 100%;
      max-width: 800px;
    }
    
    .dialog-content {
      max-height: 70vh;
      overflow: auto;
      padding: 0;
    }
    
    .json-container {
      background-color: #f5f5f5;
      border-radius: 8px;
      padding: 16px;
      margin: 16px;
    }
    
    .json-display {
      font-family: 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.4;
      color: #333;
      background: transparent;
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
    }
    
    mat-dialog-actions {
      padding: 16px 24px;
      margin: 0;
    }
    
    button {
      margin-left: 8px;
    }
    
    mat-icon {
      margin-right: 8px;
    }
  `],
  imports: [MaterialModule]
})
export class JsonDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<JsonDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {}

  formatJson(obj: any): string {
    return JSON.stringify(obj, null, 2);
  }

  async copyToClipboard(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.formatJson(this.data));
      // You could add a snackbar notification here
      console.log('JSON copied to clipboard');
    } catch (err) {
      console.error('Failed to copy JSON: ', err);
    }
  }

  close(): void {
    this.dialogRef.close();
  }
}