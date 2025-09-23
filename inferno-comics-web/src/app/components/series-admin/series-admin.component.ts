// series-admin.component.ts
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Series } from '../../models/series.model';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../material.module';
import { SeriesService } from '../../services/series.service';


@Component({
  selector: 'app-series-admin',
  templateUrl: './series-admin.component.html',
  styleUrls: ['./series-admin.component.scss'],
  imports: [CommonModule, MaterialModule, RouterModule],
})
export class SeriesAdminComponent implements OnInit {
  seriesId: number;
  series: Series | null = null;
  loading = true;
  error: string | null = null;

  // Expanded sections
  expandedSections = {
    basicInfo: true,
    metadata: false,
    comicVine: false,
    gcd: false,
    cache: false,
    issues: false,
    timestamps: false,
  };

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private snackBar: MatSnackBar,
    private seriesService: SeriesService
  ) {
    this.seriesId = +this.route.snapshot.paramMap.get('id')!;
  }

  ngOnInit(): void {
    this.loadSeries();
  }

  loadSeries(): void {
    this.loading = true;
    this.error = null;

    this.seriesService.getSeriesById(this.seriesId).subscribe({
      next: (data: Series) => {
        this.series = new Series(data);
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Failed to load series data';
        this.loading = false;
        console.error('Error loading series:', err);
      },
    });
  }

  reverifyMetadata(): void {
    this.seriesService.reverifySeries(this.seriesId).subscribe({
      next: (data) => {
        this.series = data;
        this.snackBar.open('Metadata reverified successfully', 'Close', {
          duration: 3000,
        });
      },
      error: (err) => {
        this.snackBar.open('Failed to reverify metadata', 'Close', {
          duration: 3000,
        });
        console.error('Error reverifying metadata:', err);
      },
    });
  }

  clearCache(): void {
    /*this.http.delete(`/api/series/cache`).subscribe({
      next: () => {
        this.snackBar.open('Cache cleared successfully', 'Close', {
          duration: 3000,
        });
      },
      error: (err) => {
        this.snackBar.open('Failed to clear cache', 'Close', {
          duration: 3000,
        });
        console.error('Error clearing cache:', err);
      },
    });*/
  }

  toggleSection(section: keyof typeof this.expandedSections): void {
    this.expandedSections[section] = !this.expandedSections[section];
  }

  formatDate(date: Date): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString();
  }

  formatCurrency(amount: number): string {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }

  getConditionColor(condition: string): string {
    const colors: { [key: string]: string } = {
      MINT: '#4CAF50',
      NEAR_MINT: '#8BC34A',
      VERY_FINE: '#CDDC39',
      FINE: '#FFEB3B',
      VERY_GOOD: '#FFC107',
      GOOD: '#FF9800',
      FAIR: '#FF5722',
      POOR: '#F44336',
    };
    return colors[condition] || '#9E9E9E';
  }

  openImageInNewTab(url: string): void {
    if (url) {
      window.open(url, '_blank');
    }
  }

  copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      this.snackBar.open('Copied to clipboard', 'Close', { duration: 2000 });
    });
  }
}