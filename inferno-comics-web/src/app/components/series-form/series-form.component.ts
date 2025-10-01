import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SeriesService } from '../../services/series.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ComicVineSeries } from '../../models/comic-vine.model';
import { Series } from '../../models/series.model';
import { ComicVineService } from '../../services/comic-vine.service';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../material.module';

@Component({
  selector: 'app-series-form',
  templateUrl: './series-form.component.html',
  styleUrls: ['./series-form.component.scss'],
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule]
})
export class SeriesFormComponent implements OnInit {
  seriesForm: FormGroup;
  isEditMode = false;
  isComicVineManagementMode = false;
  seriesId: number | null = null;
  loading = false;
  comicVineResults: ComicVineSeries[] = [];
  searchingComicVine = false;
  searchByComicVineId = false;
  
  // Custom search term for Comic Vine
  customSearchTerm = '';
  
  // Multi-selection properties
  selectedSeries: ComicVineSeries[] = [];
  showCombinationConfig = false;
  selectedCover: string = '';

  existingComicVineData: ComicVineSeries[] = [];
  allAvailableSeries: ComicVineSeries[] = [];

  get selectedPrimarySeries(): ComicVineSeries | null {
    return this.seriesForm.get('selectedPrimarySeries')?.value;
  }

  set selectedPrimarySeries(value: ComicVineSeries | null) {
    this.seriesForm.patchValue({ selectedPrimarySeries: value });
  }

  get updateMetadataOnAdd(): boolean {
    return this.seriesForm.get('updateMetadataOnAdd')?.value || false;
  }

  set updateMetadataOnAdd(value: boolean) {
    this.seriesForm.patchValue({ updateMetadataOnAdd: value });
  }

  constructor(
    private fb: FormBuilder,
    private seriesService: SeriesService,
    private comicVineService: ComicVineService,
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
        
        this.route.queryParams.subscribe(queryParams => {
          if (queryParams['mode'] === 'comic-vine-management') {
            this.isComicVineManagementMode = true;
          }
        });
        
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
      issuesAvailableCount: [{ value: 0, disabled: true }],
      issuesOwnedCount: [{ value: 0, disabled: true }],
      comicVineId: [''], 
      comicVineIds: [[]],
      selectedPrimarySeries: [null],
      updateMetadataOnAdd: [false],
      appendMode: [true]
    });
  }

  loadSeries(): void {
    if (this.seriesId) {
      this.loading = true;
      this.seriesService.getSeriesById(this.seriesId).subscribe({
        next: (series) => {
          this.seriesForm.patchValue(series);
          this.customSearchTerm = series.name || '';
          
          if (this.isComicVineManagementMode || this.isEditMode) {
            this.loadExistingComicVineData(series.comicVineIds || []);
          }
          
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

  loadExistingComicVineData(comicVineIds: string[]): void {
    if (!comicVineIds || comicVineIds.length === 0) {
      this.existingComicVineData = [];
      this.updateFormFromCurrentData();
      return;
    }

    this.loading = true;
    const loadPromises = comicVineIds.map(id => 
      this.comicVineService.getSeriesById(id).toPromise()
    );

    Promise.allSettled(loadPromises).then(results => {
      this.existingComicVineData = results
        .filter(result => result.status === 'fulfilled')
        .map(result => (result as PromiseFulfilledResult<ComicVineSeries>).value)
        .filter(data => data !== null);
      
      this.updateFormFromCurrentData();
      this.loading = false;
    }).catch(error => {
      console.error('Error loading existing Comic Vine data:', error);
      this.loading = false;
    });
  }

  updateFormFromCurrentData(): void {
    if (this.existingComicVineData.length === 0) {
      this.seriesForm.patchValue({
        comicVineIds: [],
        comicVineId: null,
        issuesAvailableCount: 0
      });
      return;
    }

    // Get current IDs
    const currentIds = this.existingComicVineData.map(s => s.id);
    
    // Set primary ID (keep current if valid, otherwise use first)
    const currentPrimary = this.seriesForm.get('comicVineId')?.value;
    const primaryId = currentIds.includes(currentPrimary) ? currentPrimary : currentIds[0];

    // Calculate metadata
    const startYears = this.existingComicVineData
      .map(s => s.startYear)
      .filter(year => year !== null && year !== undefined);
    const endYears = this.existingComicVineData
      .map(s => s.endYear)
      .filter(year => year !== null && year !== undefined);

    const earliestStart = startYears.length > 0 ? Math.min(...startYears) : null;
    const latestEnd = endYears.length > 0 ? Math.max(...endYears) : null;
    const totalAvailableCount = this.existingComicVineData
      .map(s => s.issueCount || 0)
      .reduce((sum, count) => sum + count, 0);

    // Update form with current state
    this.seriesForm.patchValue({
      comicVineIds: currentIds,
      comicVineId: primaryId,
      startYear: earliestStart,
      endYear: latestEnd,
      issuesAvailableCount: totalAvailableCount
    });
  }

  searchComicVine(): void {
    const searchTerm = this.customSearchTerm || this.seriesForm.get('name')?.value;
    if (!searchTerm || searchTerm.length < 3) {
      this.snackBar.open('Please enter at least 3 characters to search', 'Close', { duration: 3000 });
      return;
    }

    this.searchingComicVine = true;

    // Search by ID if checkbox is checked
    if (this.searchByComicVineId) {
      this.comicVineService.getSeriesById(searchTerm).subscribe({
        next: (result) => {
          if (result) {
            // Filter out if already associated
            const currentIds = this.existingComicVineData.map(s => s.id);
            if (currentIds.includes(result.id)) {
              this.comicVineResults = [];
              this.snackBar.open('This series is already associated', 'Close', { duration: 3000 });
            } else {
              this.comicVineResults = [result];
            }
          } else {
            this.comicVineResults = [];
            this.snackBar.open('No series found with that ID', 'Close', { duration: 3000 });
          }
          this.searchingComicVine = false;
        },
        error: (error) => {
          console.error('Error fetching Comic Vine series by ID:', error);
          this.snackBar.open('Error fetching series by ID', 'Close', { duration: 3000 });
          this.comicVineResults = [];
          this.searchingComicVine = false;
        }
      });
    } else {
      // Original text search logic
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

          const currentIds = this.existingComicVineData.map(s => s.id);
          results = results.filter(r => !currentIds.includes(r.id));

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

  removeExistingComicVineSeries(comicVineId: string): void {
    const seriesIndex = this.existingComicVineData.findIndex(s => s.id === comicVineId);
    if (seriesIndex > -1) {
      const removedSeries = this.existingComicVineData[seriesIndex];
      this.existingComicVineData.splice(seriesIndex, 1);
      
      this.updateFormFromCurrentData();
      this.seriesForm.markAsDirty();
      
      this.snackBar.open(`Removed "${removedSeries.name}" from series`, 'Close', { duration: 3000 });
    }
  }

  addToExistingSeries(): void {
    if (this.selectedSeries.length === 0) {
      this.snackBar.open('Please select at least one series to add', 'Close', { duration: 3000 });
      return;
    }

    const addedNames = this.selectedSeries.map(s => s.name).join(', ');
    const beforeCount = this.existingComicVineData.length;
    
    this.existingComicVineData.push(...this.selectedSeries);
    this.updateFormFromCurrentData();
    
    // Mark form as dirty to enable save
    this.seriesForm.markAsDirty();
    
    this.clearSelection();
    this.comicVineResults = [];
    
    const afterCount = this.existingComicVineData.length;
    this.snackBar.open(
      `Added ${this.selectedSeries.length} series (${beforeCount} → ${afterCount} total): ${addedNames}`, 
      'Close', 
      { duration: 5000 }
    );
  }

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
    this.updateMetadataOnAdd = false;
    this.allAvailableSeries = [];
  }

  combineSelectedSeries(): void {
    if (this.selectedSeries.length === 0) {
      this.snackBar.open('Please select at least one series', 'Close', { duration: 3000 });
      return;
    }

    // Check if we're in append mode for existing series
    const hasExistingSeries = this.existingComicVineData.length > 0;
    const isAppendMode = this.seriesForm.get('appendMode')?.value !== false;

    if (this.isComicVineManagementMode || (this.isEditMode && hasExistingSeries && isAppendMode)) {
      const totalSeriesAfterAdd = this.existingComicVineData.length + this.selectedSeries.length;
      
      if (totalSeriesAfterAdd >= 2) {
        this.allAvailableSeries = [...this.existingComicVineData, ...this.selectedSeries];
        this.showCombinationConfig = true;
        this.selectedPrimarySeries = this.selectedSeries[0];
        this.selectedCover = this.selectedSeries[0].imageUrl || '';
        return;
      } else {
        this.addToExistingSeries();
        return;
      }
    }

    // Regular mode or replace mode
    if (this.selectedSeries.length === 1 && !hasExistingSeries) {
      this.selectSingleSeries(this.selectedSeries[0], false); // false = don't append
      return;
    }

    this.allAvailableSeries = [...this.selectedSeries];
    this.showCombinationConfig = true;
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

    const hasExistingSeries = this.existingComicVineData.length > 0;
    const isAppendMode = this.seriesForm.get('appendMode')?.value !== false;

    if (this.isComicVineManagementMode || (this.isEditMode && hasExistingSeries && isAppendMode)) {
      this.addToExistingSeriesWithConfig();
    } else {
      this.applyRegularCombinedConfiguration();
    }
  }

  private addToExistingSeriesWithConfig(): void {
    const beforeCount = this.existingComicVineData.length;
    const addedNames = this.selectedSeries.map(s => s.name).join(', ');
    
    // Add new series to existing data
    this.existingComicVineData.push(...this.selectedSeries);
    
    // Always update cover if selected
    if (this.selectedCover) {
      this.seriesForm.patchValue({ imageUrl: this.selectedCover });
    }

    // Update metadata if requested
    if (this.updateMetadataOnAdd && this.selectedPrimarySeries) {
      this.seriesForm.patchValue({
        name: this.selectedPrimarySeries.name,
        description: this.selectedPrimarySeries.description,
        publisher: this.selectedPrimarySeries.publisher
      });
    }

    this.updateFormFromCurrentData();
    
    // Mark form as dirty to enable save
    this.seriesForm.markAsDirty();
    
    this.clearSelection();
    this.comicVineResults = [];
    this.showCombinationConfig = false;
    
    const afterCount = this.existingComicVineData.length;
    this.snackBar.open(
      `Added ${this.selectedSeries.length} series (${beforeCount} → ${afterCount} total): ${addedNames}`, 
      'Close', 
      { duration: 5000 }
    );
  }

  private applyRegularCombinedConfiguration(): void {
    const startYears = this.selectedSeries
      .map(s => s.startYear)
      .filter(year => year !== null && year !== undefined);
    const endYears = this.selectedSeries
      .map(s => s.endYear)
      .filter(year => year !== null && year !== undefined);

    const earliestStart = startYears.length > 0 ? Math.min(...startYears) : null;
    const latestEnd = endYears.length > 0 ? Math.max(...endYears) : null;
    const totalAvailableCount = this.selectedSeries
      .map(s => s.issueCount || 0)
      .reduce((sum, count) => sum + count, 0);

    this.seriesForm.patchValue({
      name: this.selectedPrimarySeries!.name,
      description: this.selectedPrimarySeries!.description,
      publisher: this.selectedPrimarySeries!.publisher,
      startYear: earliestStart,
      endYear: latestEnd,
      imageUrl: this.selectedCover,
      issuesAvailableCount: totalAvailableCount,
      comicVineId: this.selectedPrimarySeries!.id,
      comicVineIds: this.selectedSeries.map(s => s.id)
    });

    this.comicVineResults = [];
    this.showCombinationConfig = false;
    
    const seriesNames = this.selectedSeries.map(s => s.name).join(', ');
    this.snackBar.open(`Combined ${this.selectedSeries.length} series: ${seriesNames}`, 'Close', { duration: 5000 });
  }

  cancelCombination(): void {
    this.showCombinationConfig = false;
    this.selectedCover = '';
    this.selectedPrimarySeries = null;
    this.updateMetadataOnAdd = false;
    this.allAvailableSeries = [];
  }

  selectSingleSeries(comicVineSeries: ComicVineSeries, appendToExisting: boolean = true): void {
    const hasExistingSeries = this.existingComicVineData.length > 0;
    const isAppendMode = this.seriesForm.get('appendMode')?.value !== false;

    if (this.isComicVineManagementMode || (this.isEditMode && hasExistingSeries && appendToExisting && isAppendMode)) {
      this.selectedSeries = [comicVineSeries];
      this.addToExistingSeries();
      return;
    }

    // Replace mode or new series
    this.seriesForm.patchValue({
      name: comicVineSeries.name,
      description: comicVineSeries.description,
      publisher: comicVineSeries.publisher,
      startYear: comicVineSeries.startYear,
      endYear: comicVineSeries.endYear,
      imageUrl: comicVineSeries.imageUrl,
      issuesAvailableCount: comicVineSeries.issueCount || 0,
      comicVineId: comicVineSeries.id,
      comicVineIds: [comicVineSeries.id]
    });
    
    // Clear existing data since we're replacing
    this.existingComicVineData = [comicVineSeries];
    
    this.comicVineResults = [];
    this.clearSelection();
    
    if (hasExistingSeries && !isAppendMode) {
      this.snackBar.open(`Replaced series data with "${comicVineSeries.name}"`, 'Close', { duration: 3000 });
    } else {
      this.snackBar.open(`Selected "${comicVineSeries.name}"`, 'Close', { duration: 3000 });
    }
  }

  // Toggle between append and replace modes
  toggleAppendMode(): void {
    const currentMode = this.seriesForm.get('appendMode')?.value;
    this.seriesForm.patchValue({ appendMode: !currentMode });
  }

  getAppendModeLabel(): string {
    const isAppendMode = this.seriesForm.get('appendMode')?.value !== false;
    return isAppendMode ? 'Append to existing' : 'Replace existing';
  }

  // Form validation: prevent submission if no Comic Vine data in management mode
  canSubmitForm(): boolean {
    if (!this.seriesForm.valid) {
      return false;
    }

    // In Comic Vine management mode, require at least one Comic Vine series
    if (this.isComicVineManagementMode && this.existingComicVineData.length === 0) {
      return false;
    }

    return true;
  }

  onSubmit(): void {
    if (!this.canSubmitForm()) {
      if (this.isComicVineManagementMode && this.existingComicVineData.length === 0) {
        this.snackBar.open('Please add at least one Comic Vine series before saving', 'Close', { duration: 3000 });
      } else {
        this.snackBar.open('Please fix form errors before submitting', 'Close', { duration: 3000 });
      }
      return;
    }

    this.loading = true;

    // Enable fields temporarily to get their values
    this.seriesForm.get('issuesAvailableCount')?.enable();
    this.seriesForm.get('issuesOwnedCount')?.enable();
    const formData = this.seriesForm.value;
    this.seriesForm.get('issuesAvailableCount')?.disable();
    this.seriesForm.get('issuesOwnedCount')?.disable();

    // Build clean series object with only the data we need
    const seriesData: Series = {
      name: formData.name,
      description: formData.description,
      publisher: formData.publisher,
      startYear: formData.startYear,
      endYear: formData.endYear,
      imageUrl: formData.imageUrl,
      issuesAvailableCount: formData.issuesAvailableCount,
      issuesOwnedCount: formData.issuesOwnedCount,
      generatedDescription: false,
      comicVineId: formData.comicVineId,
      comicVineIds: formData.comicVineIds || []
    };

    // Add ID for updates
    if (this.isEditMode && this.seriesId) {
      (seriesData as any).id = this.seriesId;
    }

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

  cancel(): void {
    if (this.isEditMode && this.seriesId) {
      this.router.navigate(['/series', this.seriesId]);
    } else {
      this.router.navigate(['/series']);
    }
  }

  hasChanges(): boolean {
    if (!this.isEditMode) return false;
    
    // Check if form is dirty OR if we have any validation errors that need to be shown
    return this.seriesForm.dirty || this.seriesForm.invalid;
  }

  getFormTitle(): string {
    if (this.isComicVineManagementMode) {
      return 'Manage Comic Vine Series';
    }
    return this.isEditMode ? 'Edit Series' : 'Add New Series';
  }

  // Helper methods for display
  getCurrentAvailableCount(): number {
    return this.existingComicVineData
      .map(s => s.issueCount || 0)
      .reduce((sum, count) => sum + count, 0);
  }

  getCurrentOwnedCount(): number {
    return this.seriesForm.get('issuesOwnedCount')?.value || 0;
  }

  getPreviewDateRange(): string {
    if (!this.allAvailableSeries.length) return '';
    
    const startYears = this.allAvailableSeries
      .map(s => s.startYear)
      .filter(year => year !== null && year !== undefined);
    const endYears = this.allAvailableSeries
      .map(s => s.endYear)
      .filter(year => year !== null && year !== undefined);

    const earliestStart = startYears.length > 0 ? Math.min(...startYears) : null;
    const latestEnd = endYears.length > 0 ? Math.max(...endYears) : null;

    if (earliestStart && latestEnd && earliestStart !== latestEnd) {
      return `${earliestStart} - ${latestEnd}`;
    } else if (earliestStart) {
      return earliestStart.toString();
    }
    return '';
  }

  getPreviewDescription(): string {
    if (this.isComicVineManagementMode && !this.updateMetadataOnAdd) {
      return this.seriesForm.get('description')?.value || '';
    }
    return this.selectedPrimarySeries?.description || '';
  }

  getPreviewAvailableCount(): number {
    if (!this.allAvailableSeries.length) return 0;
    
    return this.allAvailableSeries
      .map(s => s.issueCount || 0)
      .reduce((sum, count) => sum + count, 0);
  }

  getPreviewSeriesCount(): number {
    return this.allAvailableSeries.length;
  }

  isExistingSeries(seriesId: string): boolean {
    return this.existingComicVineData.some(s => s.id === seriesId);
  }

  // Validation message for Comic Vine management mode
  getComicVineValidationMessage(): string {
    if (this.isComicVineManagementMode && this.existingComicVineData.length === 0) {
      return 'At least one Comic Vine series is required';
    }
    return '';
  }

  // Get status message for current operation mode
  getOperationModeMessage(): string {
    const hasExisting = this.existingComicVineData.length > 0;
    const isAppendMode = this.seriesForm.get('appendMode')?.value !== false;
    
    if (!hasExisting) {
      return 'No existing Comic Vine series - new selections will be added';
    }
    
    if (this.isComicVineManagementMode) {
      return `Managing ${hasExisting} existing series - new selections will be added`;
    }
    
    return isAppendMode 
      ? `Append mode: New selections will be added to ${hasExisting} existing series`
      : `Replace mode: New selections will replace ${hasExisting} existing series`;
  }
}