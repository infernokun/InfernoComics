import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MaterialModule } from '../../../material.module';
import { ApiResponse } from '../../../models/api-response.model';
import { Issue } from '../../../models/issue.model';
import { generateSlug, Series, SeriesWithIssues } from '../../../models/series.model';
import { IssueService } from '../../../services/issue.service';
import { RecognitionService } from '../../../services/recognition.service';
import { SeriesService } from '../../../services/series.service';
import { DateUtils } from '../../../utils/date-utils';

@Component({
  selector: 'app-series-admin',
  templateUrl: './series-admin.component.html',
  styleUrls: ['./series-admin.component.scss'],
  imports: [MaterialModule, RouterModule],
})
export class SeriesAdminComponent implements OnInit {
  seriesId: number;
  series: Series | null = null;
  loading = true;
  reverifyingIssues = false;
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

  DateUtils = DateUtils;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private snackBar: MatSnackBar,
    private seriesService: SeriesService,
    private issueService: IssueService,
    private recognitionService: RecognitionService
  ) {
    this.seriesId = 0;
  }

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug');
    if (slug) {
      this.loadSeriesBySlug(slug);
    }
  }

  loadSeriesBySlug(slug: string): void {
    this.loading = true;
    this.seriesService.getAllSeries().subscribe({
      next: (res: ApiResponse<Series[]>) => {
        if (!res.data) {
          this.loading = false;
          this.snackBar.open('Error loading series', 'Close', { duration: 3000 });
          return;
        }
        const found = res.data.find(s => generateSlug(s.name) === slug);
        if (found) {
          this.seriesId = found.id!;
          this.loadSeries();
        } else {
          this.loading = false;
          this.snackBar.open('Series not found', 'Close', { duration: 3000 });
          this.router.navigate(['/series']);
        }
      },
      error: (err: Error) => {
        console.error('Error loading series:', err);
        this.loading = false;
        this.snackBar.open('Error loading series', 'Close', { duration: 3000 });
      },
    });
  }

  loadSeries(): void {
    this.loading = true;
    this.error = null;

    this.seriesService.getSeriesByIdWithIssues(this.seriesId).subscribe({
      next: (res: ApiResponse<SeriesWithIssues>) => {
        if (!res.data) throw new Error('issue getSeriesByIdWithIssues');

        this.series = new Series(res.data.series);
        this.series.issues = res.data.issues;
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
      next: (res: ApiResponse<Series>) => {
        if (!res.data) throw new Error('issue reverifySeries');

        this.series = res.data;
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

  getImageUrl(issue: Issue) {
    return this.recognitionService.getCurrentImageUrl({issue: issue});
  }

  reverifyIssues(): void {
    this.reverifyingIssues = true;
    this.issueService.reverifyIssues(this.seriesId).subscribe({
      next: (res) => {
        if (!res.data) throw new Error('issue reverifyIssues');

        const { updated, skipped, failed } = res.data;
        this.snackBar.open(
          `Issues reverified: ${updated} updated, ${skipped} skipped, ${failed} failed`,
          'Close',
          { duration: 5000 }
        );
        this.reverifyingIssues = false;
        // Reload to show updated data
        this.loadSeries();
      },
      error: (err) => {
        this.snackBar.open('Failed to reverify issues', 'Close', {
          duration: 3000,
        });
        console.error('Error reverifying issues:', err);
        this.reverifyingIssues = false;
      },
    });
  }
}