import { Component, OnInit } from '@angular/core';
import { SeriesService } from '../../services/series.service';
import { ComicBookService } from '../../services/comic-book.service';
import { Series } from '../../models/series.model';
import { ComicBook } from '../../models/comic-book.model';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  standalone: false
})
export class DashboardComponent implements OnInit {
  totalSeries = 0;
  totalComicBooks = 0;
  keyIssues: ComicBook[] = [];
  recentSeries: Series[] = [];
  loading = true;

  constructor(
    private seriesService: SeriesService,
    private comicBookService: ComicBookService
  ) {}

  ngOnInit(): void {
    this.loadDashboardData();
  }

  loadDashboardData(): void {
    this.loading = true;

    // Load all series
    this.seriesService.getAllSeries().subscribe({
      next: (series) => {
        this.totalSeries = series.length;
        this.recentSeries = series.slice(0, 6);
      },
      error: (error) => console.error('Error loading series:', error)
    });

    // Load all comic books
    this.comicBookService.getAllComicBooks().subscribe({
      next: (comicBooks) => {
        this.totalComicBooks = comicBooks.length;
      },
      error: (error) => console.error('Error loading comic books:', error)
    });

    // Load key issues
    this.comicBookService.getKeyIssues().subscribe({
      next: (keyIssues) => {
        this.keyIssues = keyIssues.slice(0, 6);
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading key issues:', error);
        this.loading = false;
      }
    });
  }
}