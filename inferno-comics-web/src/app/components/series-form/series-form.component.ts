import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SeriesService } from '../../services/series.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
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
      description: ['', Validators.maxLength(1000)],
      publisher: ['', Validators.maxLength(255)],
      startYear: [''],
      endYear: [''],
      imageUrl: [''],
      comicVineId: ['']
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

  selectComicVineSeries(comicVineSeries: ComicVineSeries): void {
    this.seriesForm.patchValue({
      name: comicVineSeries.name,
      description: comicVineSeries.description,
      publisher: comicVineSeries.publisher,
      startYear: comicVineSeries.startYear,
      imageUrl: comicVineSeries.imageUrl,
      comicVineId: comicVineSeries.id
    });
    this.comicVineResults = [];
  }

  onSubmit(): void {
    if (this.seriesForm.valid) {
      this.loading = true;
      const seriesData: Series = this.seriesForm.value;

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