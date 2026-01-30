import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { MessageService } from '../../../services/message.service';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { SlicePipe } from '@angular/common';
import { MaterialModule } from '../../../material.module';
import { ApiResponse } from '../../../models/api-response.model';
import { generateSlug, Series } from '../../../models/series.model';
import { SeriesService } from '../../../services/series.service';
import { FADE_IN_UP, SLIDE_IN_UP, CARD_ANIMATION } from '../../../utils/animations';
import { CustomPaginatorComponent } from '../../common/custom-paginator/custom-paginator.component';
import { JsonDialogComponent } from '../../common/dialog/json-dialog/json-dialog.component';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';

type SortOption = 'name' | 'publisher' | 'year' | 'completion' | 'issueCount' | 'dateAdded';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'grid' | 'list';

@Component({
  selector: 'app-series-list',
  templateUrl: './series-list.component.html',
  styleUrls: ['./series-list.component.scss'],
  imports: [MaterialModule, FormsModule, RouterModule, SlicePipe, CustomPaginatorComponent, NgxSkeletonLoaderModule],
  animations: [
    FADE_IN_UP,
    SLIDE_IN_UP,
    CARD_ANIMATION
  ]
})
export class SeriesListComponent implements OnInit, OnDestroy {
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  pageSize: number = 3;
  pageIndex: number = 0;
  totalSeries: number = 0;

  pageSizeOptions: number[] = [3, 6, 9, 15, 18, 50, 100];

  series: Series[] = [];
  filteredSeries: Series[] = [];
  displaySeries: Series[] = [];
  loading: boolean = true;
  searchTerm: string = '';

  favoriteSeriesIds: Set<number> = new Set();
  viewMode: ViewMode = 'grid';

  currentSortOption: SortOption = 'name';
  currentSortDirection: SortDirection = 'asc';

  sortOptions = [
    { value: 'name', label: 'Name', icon: 'sort_by_alpha' },
    { value: 'publisher', label: 'Publisher', icon: 'business' },
    { value: 'year', label: 'Year', icon: 'calendar_today' },
    { value: 'completion', label: 'Completion', icon: 'pie_chart' },
    { value: 'issueCount', label: 'Issues', icon: 'library_books' },
    { value: 'dateAdded', label: 'Added', icon: 'schedule' }
  ];

  showCompletedOnly: boolean = false;
  selectedPublisher: string = '';
  publishers: string[] = [];

  private destroy$: Subject<void> = new Subject<void>();

  constructor(
    private seriesService: SeriesService,
    private router: Router,
    private messageService: MessageService,
    private dialog: MatDialog
  ) {
    this.loadUserPreferences();
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
        next: (res: ApiResponse<Series[]>) => {
          if (!res.data) throw new Error('No data received from series service');

          this.series = res.data;
          this.extractPublishers();
          this.applyFiltersAndSorting();
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading series:', error);
          this.messageService.error('Error loading series');
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

  onSearch(): void {
    this.applyFiltersAndSorting();
  }

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

  onViewModeChange(mode: ViewMode): void {
    this.viewMode = mode;
    this.saveUserPreferences();
  }

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

  applyFiltersAndSorting(): void {
    let filtered = [...this.series];

    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(s =>
        s.name!.toLowerCase().includes(term) ||
        (s.publisher && s.publisher.toLowerCase().includes(term))
      );
    }

    if (this.selectedPublisher) {
      filtered = filtered.filter(s => s.publisher === this.selectedPublisher);
    }

    if (this.showCompletedOnly) {
      filtered = filtered.filter(s => this.isSeriesComplete(s));
    }

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

  viewSeries(series: Series): void {
    if (series?.name) {
      this.router.navigate(['/series', series.id, generateSlug(series.name)]);
    }
  }

  deleteSeries(event: Event, id: number | undefined): void {
    event.stopPropagation();
    if (id && confirm('Are you sure you want to delete this series? This action cannot be undone.')) {
      this.seriesService.deleteSeries(id).subscribe({
        next: () => {
          this.messageService.success('Series deleted successfully');
          this.loadSeries();
        },
        error: (error) => {
          console.error('Error deleting series:', error);
          this.messageService.error('Error deleting series');
        }
      });
    }
  }

  trackBySeries(index: number, series: Series): any {
    return series.id;
  }

  getFilteredSeriesCount(): number {
    return this.filteredSeries.length;
  }

  getTotalSeriesCount(): number {
    return this.series.length;
  }

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
      this.pageSize = prefs.pageSize || 12;
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

  getFolderStructure(page: number = 0, pageSize: number = 8) {
    this.seriesService.getSeriesFolderStructure(page, pageSize).subscribe(
      (info: ApiResponse<{id: number, name: string}[]>) => {
        this.openJsonDialog(info);
      }
    );
  }

  openJsonDialog(data: any): void {
    this.dialog.open(JsonDialogComponent, {
      width: '90vw',
      maxWidth: '800px',
      maxHeight: '90vh',
      data: data,
      panelClass: 'json-dialog-panel'
    });
  }

  syncAllSeries() {
    this.messageService.loading('Syncing series...');
    this.seriesService.syncAllSeries().subscribe({
      next: () => {
        this.messageService.success('Series synced successfully');
        this.loadSeries();
      },
      error: () => {
        this.messageService.error('Error syncing series');
      }
    });
  }
}
