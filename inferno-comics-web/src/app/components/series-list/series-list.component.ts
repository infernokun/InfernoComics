import { Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { SeriesService } from '../../services/series.service';
import { Series } from '../../models/series.model';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../material.module';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-series-list',
  templateUrl: './series-list.component.html',
  styleUrls: ['./series-list.component.scss'],
  imports: [CommonModule, MaterialModule, FormsModule, RouterModule],
})
export class SeriesListComponent implements OnInit {
  series: Series[] = [];
  filteredSeries: Series[] = [];
  loading = true;
  searchTerm = '';

  constructor(
    private seriesService: SeriesService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadSeries();
  }

  loadSeries(): void {
    this.loading = true;
    this.seriesService.getAllSeries().subscribe({
      next: (data) => {
        this.series = data;
        this.filteredSeries = data;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading series:', error);
        this.snackBar.open('Error loading series', 'Close', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  onSearch(): void {
    if (this.searchTerm.trim()) {
      this.filteredSeries = this.series.filter(s =>
        s.name!.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        (s.publisher && s.publisher.toLowerCase().includes(this.searchTerm.toLowerCase()))
      );
    } else {
      this.filteredSeries = this.series;
    }
  }

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
}