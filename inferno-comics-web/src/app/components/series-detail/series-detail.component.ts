import { Component, Inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SeriesService } from '../../services/series.service';
import { ComicBookService } from '../../services/comic-book.service';
import { ComicBookCondition } from '../../models/comic-book.model';
import { ComicBookFormComponent } from '../comic-book-form/comic-book-form.component';
import { ComicVineService } from '../../services/comic-vine.service';
import { Series } from '../../models/series.model';

@Component({
  selector: 'app-series-detail',
  templateUrl: './series-detail.component.html',
  styleUrls: ['./series-detail.component.scss'],
  standalone: false
})
export class SeriesDetailComponent implements OnInit {
  series: Series | null = null;
  comicBooks: any[] = [];
  comicVineIssues: any[] = [];
  selectedIssues: Set<string> = new Set();
  lastSelectedIndex: number = -1;
  loading = false;
  loadingComicVine = false;
  selectedTabIndex = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private seriesService: SeriesService,
    private comicBookService: ComicBookService,
    private comicVineService: ComicVineService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadSeries(+id);
      this.loadComicBooks(+id);
    }
  }

  loadSeries(id: number): void {
    this.loading = true;
    this.seriesService.getSeriesById(id).subscribe({
      next: (series) => {
        this.series = series;
        this.loading = false;
        // Auto-load Comic Vine issues if we have a Comic Vine ID
        if (series.comicVineId) {
          this.loadComicVineIssues();
        }
      },
      error: (error) => {
        console.error('Error loading series:', error);
        this.loading = false;
        this.snackBar.open('Error loading series', 'Close', { duration: 3000 });
      }
    });
  }

  loadComicBooks(seriesId: number): void {
    this.comicBookService.getComicBooksBySeries(seriesId).subscribe({
      next: (books) => {
        this.comicBooks = books;
      },
      error: (error) => {
        console.error('Error loading comic books:', error);
      }
    });
  }

  loadComicVineIssues(): void {
    if (!this.series?.id) return;
    
    this.loadingComicVine = true;
    this.comicVineService.searchIssues(this.series.id.toString()).subscribe({
      next: (issues) => {
        this.comicVineIssues = issues;
        this.loadingComicVine = false;
      },
      error: (error) => {
        console.error('Error loading Comic Vine issues:', error);
        this.loadingComicVine = false;
        this.snackBar.open('Error loading Comic Vine issues', 'Close', { duration: 3000 });
      }
    });
  }

  // Selection methods
  onIssueClick(event: MouseEvent, issueId: string, index: number): void {
    if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd click - toggle selection
      this.toggleSelection(issueId);
    } else if (event.shiftKey && this.lastSelectedIndex !== -1) {
      // Shift click - select range
      this.selectRangeByIndex(this.lastSelectedIndex, index);
    } else {
      // Normal click - single selection
      this.clearSelection();
      this.selectedIssues.add(issueId);
    }
    this.lastSelectedIndex = index;
  }

  toggleSelection(issueId: string): void {
    if (this.selectedIssues.has(issueId)) {
      this.selectedIssues.delete(issueId);
    } else {
      this.selectedIssues.add(issueId);
    }
  }

  selectRangeByIndex(startIndex: number, endIndex: number): void {
    const start = Math.min(startIndex, endIndex);
    const end = Math.max(startIndex, endIndex);
    
    for (let i = start; i <= end; i++) {
      if (i < this.comicVineIssues.length) {
        this.selectedIssues.add(this.comicVineIssues[i].id);
      }
    }
  }

  selectAll(): void {
    this.comicVineIssues.forEach(issue => {
      this.selectedIssues.add(issue.id);
    });
  }

  selectNone(): void {
    this.clearSelection();
  }

  selectRange(): void {
    // Open a dialog to select a range
    const dialog = this.dialog.open(RangeSelectionDialog, {
      width: '400px',
      data: { 
        maxIssue: this.getMaxIssueNumber(),
        issues: this.comicVineIssues
      }
    });

    dialog.afterClosed().subscribe(result => {
      if (result) {
        this.selectIssueRange(result.start, result.end);
      }
    });
  }

  selectIssueRange(startNumber: number, endNumber: number): void {
    this.comicVineIssues.forEach(issue => {
      const issueNum = this.parseIssueNumber(issue.issueNumber);
      if (issueNum >= startNumber && issueNum <= endNumber) {
        this.selectedIssues.add(issue.id);
      }
    });
  }

  private parseIssueNumber(issueNumber: string): number {
    if (!issueNumber) return 0;
    const match = issueNumber.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  private getMaxIssueNumber(): number {
    let max = 0;
    this.comicVineIssues.forEach(issue => {
      const num = this.parseIssueNumber(issue.issueNumber);
      if (num > max) max = num;
    });
    return max;
  }

  clearSelection(): void {
    this.selectedIssues.clear();
    this.lastSelectedIndex = -1;
  }

  // Bulk actions
  addSelectedToCollection(): void {
    if (this.selectedIssues.size === 0) {
      this.snackBar.open('No issues selected', 'Close', { duration: 3000 });
      return;
    }

    const selectedIssues = this.comicVineIssues.filter(issue => 
      this.selectedIssues.has(issue.id)
    );

    // Create comic books for all selected issues
    const creationPromises = selectedIssues.map(issue => {
      const comicBookData = {
        seriesId: this.series!.id,
        issueNumber: issue.issueNumber,
        title: issue.name,
        description: issue.description,
        coverDate: issue.coverDate,
        imageUrl: issue.imageUrl,
        comicVineId: issue.id,
        condition: 'VERY_FINE',  // Use enum value instead of "VF"
        purchasePrice: 0,
        currentValue: 0,
        keyIssue: false
      };

      return this.comicBookService.createComicBook(comicBookData).toPromise();
    });

    Promise.all(creationPromises).then(() => {
      this.snackBar.open(`Added ${selectedIssues.length} issues to collection`, 'Close', { duration: 3000 });
      this.loadComicBooks(this.series?.id!);
      this.clearSelection();
    }).catch(error => {
      console.error('Error adding issues:', error);
      this.snackBar.open('Error adding some issues', 'Close', { duration: 3000 });
    });
  }

  isIssueOwned(issue: any): boolean {
    return this.comicBooks.some(book => 
      book.comicVineId === issue.id || 
      book.issueNumber === issue.issueNumber
    );
  }

  isIssueSelected(issueId: string): boolean {
    return this.selectedIssues.has(issueId);
  }

  get selectedCount(): number {
    return this.selectedIssues.size;
  }

  // Value calculation methods
  calculateTotalPurchasePrice(): number {
    return this.comicBooks.reduce((total, book) => total + (book.purchasePrice || 0), 0);
  }

  calculateCurrentValue(): number {
    return this.comicBooks.reduce((total, book) => total + (book.currentValue || 0), 0);
  }

  // Existing methods...
  addComicBook(): void {
    const dialogRef = this.dialog.open(ComicBookFormComponent, {
      width: '600px',
      data: { seriesId: this.series!.id }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadComicBooks(this.series?.id!);
      }
    });
  }

  viewComicBook(comicBookId: number): void {
    // Find the comic book in our current list
    const comicBook = this.comicBooks.find(comic => comic.id === comicBookId);
    if (comicBook) {
      const dialogRef = this.dialog.open(ComicBookViewDialog, {
        width: '700px',
        maxWidth: '90vw',
        data: { comicBook }
      });
    }
  }

  editComicBook(comicBook: any): void {
    const dialogRef = this.dialog.open(ComicBookFormComponent, {
      width: '600px',
      data: { comicBook, seriesId: this.series!.id }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadComicBooks(this.series?.id!);
      }
    });
  }

  deleteComicBook(id: number): void {
    if (confirm('Are you sure you want to delete this comic book?')) {
      this.comicBookService.deleteComicBook(id).subscribe({
        next: () => {
          this.snackBar.open('Comic book deleted', 'Close', { duration: 3000 });
          this.loadComicBooks(this.series?.id!);
        },
        error: (error) => {
          console.error('Error deleting comic book:', error);
          this.snackBar.open('Error deleting comic book', 'Close', { duration: 3000 });
        }
      });
    }
  }

  addFromComicVine(issue: any): void {
    const dialogRef = this.dialog.open(ComicBookFormComponent, {
      width: '600px',
      data: { 
        seriesId: this.series?.id,
        comicVineIssue: issue
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadComicBooks(this.series?.id!);
      }
    });
  }

  editSeries(): void {
    this.router.navigate(['/series', this.series?.id, 'edit']);
  }

  deleteSeries(): void {
    if (confirm('Are you sure you want to delete this series and all its comic books?')) {
      this.seriesService.deleteSeries(this.series?.id!).subscribe({
        next: () => {
          this.snackBar.open('Series deleted', 'Close', { duration: 3000 });
          this.router.navigate(['/series']);
        },
        error: (error) => {
          console.error('Error deleting series:', error);
          this.snackBar.open('Error deleting series', 'Close', { duration: 3000 });
        }
      });
    }
  }

  generateNewDescription(seriesId: number): void {
    /*this.seriesService.generateDescription(seriesId).subscribe({
      next: (updatedSeries) => {
        this.series = updatedSeries;
        this.snackBar.open('New description generated', 'Close', { duration: 3000 });
      },
      error: (error) => {
        console.error('Error generating description:', error);
        this.snackBar.open('Error generating new description', 'Close', { duration: 3000 });
      }
    });*/
  }
}

// Range Selection Dialog Component
@Component({
  selector: 'range-selection-dialog',
  template: `
    <h2 mat-dialog-title>Select Issue Range</h2>
    <mat-dialog-content>
      <div class="range-form">
        <mat-form-field appearance="outline">
          <mat-label>Start Issue</mat-label>
          <input matInput type="number" [(ngModel)]="startIssue" min="1">
        </mat-form-field>
        
        <mat-form-field appearance="outline">
          <mat-label>End Issue</mat-label>
          <input matInput type="number" [(ngModel)]="endIssue" min="1">
        </mat-form-field>
      </div>
      
      <p class="range-preview" *ngIf="startIssue && endIssue">
        Will select {{ getIssueCount() }} issues ({{ startIssue }} - {{ endIssue }})
      </p>
    </mat-dialog-content>
    <mat-dialog-actions>
      <button mat-button (click)="cancel()">Cancel</button>
      <button mat-raised-button color="primary" 
              (click)="confirm()" 
              [disabled]="!isValid()">
        Select Range
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .range-form {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
    }
    .range-preview {
      color: var(--text-secondary);
      font-style: italic;
    }
  `],
  standalone: false
})
export class RangeSelectionDialog {
  startIssue: number = 1;
  endIssue: number = 1;

  constructor(
    public dialogRef: MatDialogRef<RangeSelectionDialog>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.endIssue = data.maxIssue || 1;
  }

  cancel(): void {
    this.dialogRef.close();
  }

  confirm(): void {
    if (this.isValid()) {
      this.dialogRef.close({
        start: this.startIssue,
        end: this.endIssue
      });
    }
  }

  isValid(): boolean {
    return this.startIssue > 0 && 
           this.endIssue > 0 && 
           this.startIssue <= this.endIssue;
  }

  getIssueCount(): number {
    if (this.isValid()) {
      return this.endIssue - this.startIssue + 1;
    }
    return 0;
  }
}

@Component({
  selector: 'comic-book-view-dialog',
  template: `
    <div class="comic-view-container">
      <div class="comic-view-header">
        <h2 mat-dialog-title>{{ data.comicBook.title || 'Issue #' + data.comicBook.issueNumber }}</h2>
        <button mat-icon-button mat-dialog-close class="close-button">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      
      <mat-dialog-content class="comic-view-content">
        <div class="comic-view-layout">
          <div class="comic-image-section">
            <div class="comic-image-container">
              <img [src]="data.comicBook.imageUrl || 'assets/placeholder-comic.jpg'" 
                   [alt]="'Issue #' + data.comicBook.issueNumber"
                   onerror="if(this.src!=='assets/placeholder-comic.jpg'){this.src='assets/placeholder-comic.jpg'}">
              <div class="key-issue-badge" *ngIf="data.comicBook.keyIssue">
                <mat-icon>star</mat-icon>
                <span>Key Issue</span>
              </div>
            </div>
          </div>
          
          <div class="comic-details-section">
            <div class="detail-group">
              <h3>Basic Information</h3>
              <div class="detail-grid">
                <div class="detail-item">
                  <span class="label">Issue Number:</span>
                  <span class="value">#{{ data.comicBook.issueNumber }}</span>
                </div>
                <div class="detail-item">
                  <span class="label">Cover Date:</span>
                  <span class="value">{{ data.comicBook.coverDate || 'Not specified' }}</span>
                </div>
                <div class="detail-item">
                  <span class="label">Condition:</span>
                  <span class="value condition-badge" [class]="getConditionClass(data.comicBook.condition)">
                    {{ formatCondition(data.comicBook.condition) }}
                  </span>
                </div>
              </div>
            </div>

            <div class="detail-group" *ngIf="data.comicBook.description">
              <h3>Description</h3>
              <p class="description-text">{{ data.comicBook.description }}</p>
            </div>

            <div class="detail-group">
              <h3>Financial Information</h3>
              <div class="financial-grid">
                <div class="financial-card purchase">
                  <div class="financial-label">Purchase Price</div>
                  <div class="financial-value">\${{ data.comicBook.purchasePrice || 0 }}</div>
                </div>
                <div class="financial-card current">
                  <div class="financial-label">Current Value</div>
                  <div class="financial-value">\${{ data.comicBook.currentValue || 0 }}</div>
                </div>
                <div class="financial-card profit" *ngIf="getProfitLoss() !== 0">
                  <div class="financial-label">{{ getProfitLoss() >= 0 ? 'Profit' : 'Loss' }}</div>
                  <div class="financial-value" [class.profit]="getProfitLoss() >= 0" [class.loss]="getProfitLoss() < 0">
                    {{ getProfitLoss() >= 0 ? '+' : '' }}\${{ Math.abs(getProfitLoss()) }}
                  </div>
                </div>
              </div>
            </div>

            <div class="detail-group" *ngIf="data.comicBook.comicVineId">
              <h3>Comic Vine Integration</h3>
              <div class="comic-vine-info">
                <mat-icon>link</mat-icon>
                <span>Linked to Comic Vine ID: {{ data.comicBook.comicVineId }}</span>
              </div>
            </div>
          </div>
        </div>
      </mat-dialog-content>
      
      <mat-dialog-actions class="comic-view-actions">
        <button mat-button mat-dialog-close>
          <mat-icon>close</mat-icon>
          Close
        </button>
        <button mat-raised-button color="primary" (click)="editComic()">
          <mat-icon>edit</mat-icon>
          Edit
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .comic-view-container {
      max-width: 100%;
      overflow: hidden;
    }

    .comic-view-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px 0 24px;
      border-bottom: 1px solid var(--border-color);
      margin-bottom: 0;

      h2 {
        margin: 0;
        color: var(--text-primary);
        font-weight: 600;
        font-size: 1.5rem;
      }

      .close-button {
        color: var(--text-muted);
      }
    }

    .comic-view-content {
      padding: 24px !important;
      max-height: 70vh;
      overflow-y: auto;
    }

    .comic-view-layout {
      display: grid;
      grid-template-columns: 300px 1fr;
      gap: 32px;
    }

    .comic-image-section {
      .comic-image-container {
        position: relative;
        text-align: center;

        img {
          width: 100%;
          max-width: 300px;
          height: auto;
          border-radius: 12px;
          box-shadow: var(--shadow-lg);
          border: 2px solid var(--border-color);
        }

        .key-issue-badge {
          position: absolute;
          top: 12px;
          right: 12px;
          background: linear-gradient(135deg, var(--accent-color), #f59e0b);
          color: white;
          padding: 8px 12px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          gap: 6px;
          font-weight: 600;
          font-size: 0.9rem;
          box-shadow: var(--shadow-md);

          mat-icon {
            font-size: 18px;
            width: 18px;
            height: 18px;
          }
        }
      }
    }

    .comic-details-section {
      .detail-group {
        margin-bottom: 32px;

        h3 {
          margin: 0 0 16px 0;
          color: var(--primary-color);
          font-weight: 600;
          font-size: 1.2rem;
          border-bottom: 2px solid var(--primary-color);
          padding-bottom: 8px;
        }

        .detail-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .detail-item {
          display: flex;
          flex-direction: column;
          gap: 4px;

          .label {
            font-size: 0.9rem;
            color: var(--text-secondary);
            font-weight: 500;
          }

          .value {
            font-size: 1.1rem;
            color: var(--text-primary);
            font-weight: 600;

            &.condition-badge {
              display: inline-block;
              padding: 4px 12px;
              border-radius: 12px;
              font-size: 0.9rem;
              text-transform: uppercase;
              letter-spacing: 0.5px;

              &.mint { background: linear-gradient(135deg, #10b981, #059669); color: white; }
              &.near-mint { background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; }
              &.very-fine { background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; }
              &.fine { background: linear-gradient(135deg, #f59e0b, #d97706); color: white; }
              &.very-good { background: linear-gradient(135deg, #ef4444, #dc2626); color: white; }
              &.good { background: linear-gradient(135deg, #6b7280, #4b5563); color: white; }
              &.fair { background: linear-gradient(135deg, #92400e, #78350f); color: white; }
              &.poor { background: linear-gradient(135deg, #1f2937, #111827); color: white; }
            }
          }
        }

        .description-text {
          line-height: 1.6;
          color: var(--text-primary);
          background: var(--background-color);
          padding: 16px;
          border-radius: 8px;
          border-left: 4px solid var(--primary-color);
          margin: 0;
        }

        .financial-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 16px;
        }

        .financial-card {
          text-align: center;
          padding: 20px 16px;
          border-radius: 12px;
          border: 2px solid var(--border-color);
          background: var(--surface-color);

          &.purchase {
            border-color: var(--primary-color);
            background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(59, 130, 246, 0.05));
          }

          &.current {
            border-color: var(--secondary-color);
            background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, 0.05));
          }

          &.profit {
            border-color: var(--success-color);
            background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, 0.05));
          }

          .financial-label {
            font-size: 0.9rem;
            color: var(--text-secondary);
            margin-bottom: 8px;
            font-weight: 500;
          }

          .financial-value {
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--text-primary);

            &.profit { color: var(--success-color); }
            &.loss { color: var(--error-color); }
          }
        }

        .comic-vine-info {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: var(--background-color);
          border-radius: 8px;
          color: var(--text-secondary);

          mat-icon {
            color: var(--primary-color);
          }
        }
      }
    }

    .comic-view-actions {
      padding: 16px 24px !important;
      border-top: 1px solid var(--border-color);
      background: var(--background-color);
      display: flex;
      justify-content: flex-end;
      gap: 12px;

      button {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 20px;
        font-weight: 500;
        border-radius: 8px;

        &.mat-mdc-raised-button {
          background: linear-gradient(135deg, var(--primary-color), var(--secondary-color)) !important;
          color: white !important;
        }
      }
    }

    @media (max-width: 768px) {
      .comic-view-layout {
        grid-template-columns: 1fr;
        gap: 24px;
      }

      .comic-image-section {
        text-align: center;
      }

      .detail-grid {
        grid-template-columns: 1fr !important;
      }

      .financial-grid {
        grid-template-columns: 1fr !important;
      }
    }
  `],
  standalone: false
})
export class ComicBookViewDialog {
  Math = Math; // Make Math available in template

  constructor(
    public dialogRef: MatDialogRef<ComicBookViewDialog>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private dialog: MatDialog
  ) {}

  editComic(): void {
    this.dialogRef.close();
    // Open edit dialog
    const editDialogRef = this.dialog.open(ComicBookFormComponent, {
      width: '600px',
      data: { 
        comicBook: this.data.comicBook, 
        seriesId: this.data.comicBook.seriesId 
      }
    });
  }

  formatCondition(condition: string): string {
    if (!condition) return 'Not specified';
    return condition.replace(/_/g, ' ').toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  getConditionClass(condition: string): string {
    if (!condition) return '';
    return condition.toLowerCase().replace(/_/g, '-');
  }

  getProfitLoss(): number {
    const purchase = this.data.comicBook.purchasePrice || 0;
    const current = this.data.comicBook.currentValue || 0;
    return current - purchase;
  }
}