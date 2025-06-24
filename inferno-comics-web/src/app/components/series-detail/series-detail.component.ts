import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SeriesService } from '../../services/series.service';
import { ComicBookService } from '../../services/comic-book.service';
import { Series } from '../../models/series.model';
import { ComicBook } from '../../models/comic-book.model';
import { ComicVineIssue } from '../../models/comic-vine.model';
import { ComicBookFormComponent } from '../comic-book-form/comic-book-form.component';

@Component({
  selector: 'app-series-detail',
  templateUrl: './series-detail.component.html',
  styleUrls: ['./series-detail.component.scss'],
  standalone: false
})
export class SeriesDetailComponent implements OnInit {
  series: Series | null = null;
  comicBooks: ComicBook[] = [];
  comicVineIssues: ComicVineIssue[] = [];
  loading = true;
  selectedTabIndex = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private seriesService: SeriesService,
    private comicBookService: ComicBookService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const id = +params['id'];
      if (id) {
        this.loadSeriesDetails(id);
      }
    });
  }

  loadSeriesDetails(id: number): void {
    this.loading = true;
    
    // Load series details
    this.seriesService.getSeriesById(id).subscribe({
      next: (series) => {
        this.series = series;
        this.loadComicBooks(id);
        this.loadComicVineIssues(id);
      },
      error: (error) => {
        console.error('Error loading series:', error);
        this.snackBar.open('Error loading series', 'Close', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  loadComicBooks(seriesId: number): void {
    this.comicBookService.getComicBooksBySeriesId(seriesId).subscribe({
      next: (comicBooks) => {
        this.comicBooks = comicBooks;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading comic books:', error);
        this.loading = false;
      }
    });
  }

  loadComicVineIssues(seriesId: number): void {
    this.comicBookService.searchComicVineIssues(seriesId).subscribe({
      next: (issues) => {
        this.comicVineIssues = issues;
      },
      error: (error) => {
        console.error('Error loading Comic Vine issues:', error);
      }
    });
  }

  addComicBook(): void {
    if (!this.series?.id) return;

    const dialogRef = this.dialog.open(ComicBookFormComponent, {
      width: '600px',
      data: { 
        seriesId: this.series.id,
        comicVineIssues: this.comicVineIssues
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadComicBooks(this.series!.id!);
      }
    });
  }

  editComicBook(comicBook: ComicBook): void {
    if (!this.series?.id) return;

    const dialogRef = this.dialog.open(ComicBookFormComponent, {
      width: '600px',
      data: { 
        seriesId: this.series.id,
        comicBook: comicBook,
        comicVineIssues: this.comicVineIssues
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadComicBooks(this.series!.id!);
      }
    });
  }

  deleteComicBook(comicBook: ComicBook): void {
    if (comicBook.id && confirm('Are you sure you want to delete this comic book?')) {
      this.comicBookService.deleteComicBook(comicBook.id).subscribe({
        next: () => {
          this.snackBar.open('Comic book deleted successfully', 'Close', { duration: 3000 });
          this.loadComicBooks(this.series!.id!);
        },
        error: (error) => {
          console.error('Error deleting comic book:', error);
          this.snackBar.open('Error deleting comic book', 'Close', { duration: 3000 });
        }
      });
    }
  }

  addFromComicVine(issue: ComicVineIssue): void {
    if (!this.series?.id) return;

    const dialogRef = this.dialog.open(ComicBookFormComponent, {
      width: '600px',
      data: { 
        seriesId: this.series.id,
        comicVineIssue: issue
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadComicBooks(this.series!.id!);
      }
    });
  }

  isIssueOwned(issueNumber: string): boolean {
    return this.comicBooks.some(cb => cb.issueNumber === issueNumber);
  }

  getOwnedIssue(issueNumber: string): ComicBook | undefined {
    return this.comicBooks.find(cb => cb.issueNumber === issueNumber);
  }

  editSeries(): void {
    if (this.series?.id) {
      this.router.navigate(['/series', this.series.id, 'edit']);
    }
  }

  getTotalValue(): number {
    return this.comicBooks.reduce((total, cb) => total + (cb.currentValue || 0), 0);
  }

  getTotalPurchasePrice(): number {
    return this.comicBooks.reduce((total, cb) => total + (cb.purchasePrice || 0), 0);
  }

  getKeyIssuesCount(): number {
    return this.comicBooks.filter(cb => cb.isKeyIssue).length;
  }
}