import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SeriesService } from '../../services/series.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ComicVineSeries } from '../../models/comic-vine.model';
import { Series } from '../../models/series.model';

@Component({
  selector: 'app-series-form',
  templateUrl: './series-form.component.html',
  styleUrls: ['./series-form.component.scss'],
  standalone: false
})
export class SeriesFormComponent implements OnInit {
  seriesForm: FormGroup;
  isEditMode = false;
  seriesId: number | null = null;
  loading = false;
  comicVineResults: ComicVineSeries[] = [];
  searchingComicVine = false;
  
  // Multi-selection properties
  selectedSeries: ComicVineSeries[] = [];
  showCombinationConfig = false;
  selectedCover: string = '';
  selectedPrimarySeries: ComicVineSeries | null = null;

  constructor(
    private fb: FormBuilder,
    private seriesService: SeriesService,
    private router: Router,
    private route: ActivatedRoute,
    private snackBar: MatSnackBar
  ) {
    this.seriesForm = this.createForm();
  }

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      if (params['id']) {
        this.isEditMode = true;
        this.seriesId = +params['id'];
        this.loadSeries();
      }
    });
  }

  createForm(): FormGroup {
    return this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(255)]],
      description: ['', Validators.maxLength(10000)],
      publisher: ['', Validators.maxLength(255)],
      startYear: [''],
      endYear: [''],
      imageUrl: [''],
      issueCount: [{ value: 0, disabled: true }], // Disable editing for issue count
      comicVineId: [''], // Keep for backwards compatibility
      comicVineIds: [[]] // Array of Comic Vine IDs for combined series
    });
  }

  loadSeries(): void {
    if (this.seriesId) {
      this.loading = true;
      this.seriesService.getSeriesById(this.seriesId).subscribe({
        next: (series) => {
          this.seriesForm.patchValue(series);
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading series:', error);
          this.snackBar.open('Error loading series', 'Close', { duration: 3000 });
          this.loading = false;
        }
      });
    }
  }

  searchComicVine(): void {
    const searchTerm = this.seriesForm.get('name')?.value;
    if (searchTerm && searchTerm.length > 2) {
      this.searchingComicVine = true;
      this.seriesService.searchComicVineSeries(searchTerm).subscribe({
        next: (results) => {
          results = results.sort((a, b) => {
            if (a.startYear && b.startYear) {
              return b.startYear - a.startYear;
            } else if (a.startYear) {
              return -1; 
            } else if (b.startYear) {
              return 1;
            }
            return 0; 
          });

          this.comicVineResults = results;
          this.searchingComicVine = false;
        },
        error: (error) => {
          console.error('Error searching Comic Vine:', error);
          this.searchingComicVine = false;
        }
      });
    }
  }

  // Multi-selection methods
  isSeriesSelected(series: ComicVineSeries): boolean {
    return this.selectedSeries.some(s => s.id === series.id);
  }

  toggleSeriesSelection(series: ComicVineSeries): void {
    const index = this.selectedSeries.findIndex(s => s.id === series.id);
    if (index > -1) {
      this.selectedSeries.splice(index, 1);
    } else {
      this.selectedSeries.push(series);
    }
  }

  removeFromSelection(series: ComicVineSeries): void {
    const index = this.selectedSeries.findIndex(s => s.id === series.id);
    if (index > -1) {
      this.selectedSeries.splice(index, 1);
    }
  }

  clearSelection(): void {
    this.selectedSeries = [];
    this.showCombinationConfig = false;
    this.selectedCover = '';
    this.selectedPrimarySeries = null;
  }

  combineSelectedSeries(): void {
    if (this.selectedSeries.length === 0) {
      this.snackBar.open('Please select at least one series', 'Close', { duration: 3000 });
      return;
    }

    // If only one series is selected, auto-apply it
    if (this.selectedSeries.length === 1) {
      this.selectSingleSeries(this.selectedSeries[0]);
      return;
    }

    // Show combination configuration
    this.showCombinationConfig = true;
    
    // Set default selections
    this.selectedPrimarySeries = this.selectedSeries[0];
    this.selectedCover = this.selectedSeries[0].imageUrl || '';
  }

  selectCover(imageUrl: string): void {
    this.selectedCover = imageUrl;
  }

  applyCombinedConfiguration(): void {
    if (!this.selectedPrimarySeries || !this.selectedCover) {
      this.snackBar.open('Please select primary series and cover image', 'Close', { duration: 3000 });
      return;
    }

    // Calculate combined date range
    const startYears = this.selectedSeries
      .map(s => s.startYear)
      .filter(year => year !== null && year !== undefined);
    const endYears = this.selectedSeries
      .map(s => s.endYear)
      .filter(year => year !== null && year !== undefined);

    const earliestStart = startYears.length > 0 ? Math.min(...startYears) : null;
    const latestEnd = endYears.length > 0 ? Math.max(...endYears) : null;

    // Calculate total issue count
    const totalIssueCount = this.selectedSeries
      .map(s => s.issueCount || 0)
      .reduce((sum, count) => sum + count, 0);

    // Update form with combined data
    this.seriesForm.patchValue({
      name: this.selectedPrimarySeries.name,
      description: this.selectedPrimarySeries.description,
      publisher: this.selectedPrimarySeries.publisher,
      startYear: earliestStart,
      endYear: latestEnd,
      imageUrl: this.selectedCover,
      issueCount: totalIssueCount,
      comicVineId: this.selectedPrimarySeries.id, // Primary series ID for backwards compatibility
      comicVineIds: this.selectedSeries.map(s => s.id)
    });

    // Clear results and hide config
    this.comicVineResults = [];
    this.showCombinationConfig = false;
    
    // Show success message
    const seriesNames = this.selectedSeries.map(s => s.name).join(', ');
    this.snackBar.open(`Combined ${this.selectedSeries.length} series: ${seriesNames}`, 'Close', { duration: 5000 });
  }

  cancelCombination(): void {
    this.showCombinationConfig = false;
    this.selectedCover = '';
    this.selectedPrimarySeries = null;
  }

  // Legacy single series selection (kept for backwards compatibility)
  selectSingleSeries(comicVineSeries: ComicVineSeries): void {
    this.seriesForm.patchValue({
      name: comicVineSeries.name,
      description: comicVineSeries.description,
      publisher: comicVineSeries.publisher,
      startYear: comicVineSeries.startYear,
      endYear: comicVineSeries.endYear,
      imageUrl: comicVineSeries.imageUrl,
      issueCount: comicVineSeries.issueCount || 0,
      comicVineId: comicVineSeries.id,
      comicVineIds: [comicVineSeries.id]
    });
    this.comicVineResults = [];
    this.clearSelection();
  }

  onSubmit(): void {
    if (this.seriesForm.valid) {
      this.loading = true;

      this.seriesForm.get('issueCount')?.enable();
      const seriesData: Series = this.seriesForm.value;
      this.seriesForm.get('issueCount')?.disable();

      const operation = this.isEditMode && this.seriesId
        ? this.seriesService.updateSeries(this.seriesId, seriesData)
        : this.seriesService.createSeries(seriesData);

      operation.subscribe({
        next: (result) => {
          const message = this.isEditMode ? 'Series updated successfully' : 'Series created successfully';
          this.snackBar.open(message, 'Close', { duration: 3000 });
          this.router.navigate(['/series', result.id]);
        },
        error: (error) => {
          console.error('Error saving series:', error);
          this.snackBar.open('Error saving series', 'Close', { duration: 3000 });
          this.loading = false;
        }
      });
    }
  }

  cancel(): void {
    if (this.isEditMode && this.seriesId) {
      this.router.navigate(['/series', this.seriesId]);
    } else {
      this.router.navigate(['/series']);
    }
  }
}