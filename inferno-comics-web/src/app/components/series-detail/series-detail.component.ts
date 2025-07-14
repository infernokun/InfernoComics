import { Component, Inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SeriesService } from '../../services/series.service';
import { IssueService } from '../../services/issue.service';
import { IssueFormComponent } from '../issue-form/issue-form.component';
import { ComicVineService } from '../../services/comic-vine.service';
import { Series } from '../../models/series.model';
import { ComicVineIssue } from '../../models/comic-vine.model';
import { RangeSelectionDialog } from './range-selection-dialog/range-selection-dialog';
import {
  ComicMatch,
  ComicMatchSelectionComponent,
  ImageMatcherResponse,
} from './comic-match-selection/comic-match-selection.component';
import { IssueViewDialog } from './issue-view-dialog/issue-view-dialog.component';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../material.module';
import { ConfirmationDialogComponent } from '../common/dialog/confirmation-dialog/confirmation-dialog.component';
import { Issue } from '../../models/issue.model';

@Component({
  selector: 'app-series-detail',
  templateUrl: './series-detail.component.html',
  styleUrls: ['./series-detail.component.scss'],
  imports: [CommonModule, MaterialModule],
})
export class SeriesDetailComponent implements OnInit {
  series: Series | null = null;
  issues: any[] = [];
  comicVineIssues: any[] = [];
  selectedIssues: Set<string> = new Set();
  lastSelectedIndex: number = -1;
  loading = false;
  loadingComicVine = false;
  selectedTabIndex = 0;
  isCompactView = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private seriesService: SeriesService,
    private issueService: IssueService,
    private comicVineService: ComicVineService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadSeries(+id);
      this.loadIssues(+id);
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
      },
    });
  }

  loadIssues(seriesId: number): void {
    this.issueService.getIssuesBySeries(seriesId).subscribe({
      next: (books) => {
        this.issues = books;
      },
      error: (error) => {
        console.error('Error loading comic books:', error);
      },
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
        this.snackBar.open('Error loading Comic Vine issues', 'Close', {
          duration: 3000,
        });
      },
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
    this.comicVineIssues.forEach((issue) => {
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
        issues: this.comicVineIssues,
      },
    });

    dialog.afterClosed().subscribe((result) => {
      if (result) {
        this.selectIssueRange(result.start, result.end);
      }
    });
  }

  selectIssueRange(startNumber: number, endNumber: number): void {
    this.comicVineIssues.forEach((issue) => {
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
    this.comicVineIssues.forEach((issue) => {
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

    const selectedIssues = this.comicVineIssues.filter((issue) =>
      this.selectedIssues.has(issue.id)
    );

    // Create comic books for all selected issues
    const creationPromises = selectedIssues.map((issue: ComicVineIssue) => {
      const issueData = {
        seriesId: this.series!.id,
        issueNumber: issue.issueNumber,
        title: issue.name,
        description: issue.description,
        coverDate: issue.coverDate,
        imageUrl: issue.imageUrl,
        comicVineId: issue.id,
        condition: 'VERY_FINE', // Use enum value instead of "VF"
        purchasePrice: 0,
        currentValue: 0,
        keyIssue: false,
        generatedDescription: issue.generatedDescription || false,
      };

      return this.issueService.createIssue(issueData).toPromise();
    });

    Promise.all(creationPromises)
      .then(() => {
        this.snackBar.open(
          `Added ${selectedIssues.length} issues to collection`,
          'Close',
          { duration: 3000 }
        );
        this.loadIssues(this.series?.id!);
        this.clearSelection();
      })
      .catch((error) => {
        console.error('Error adding issues:', error);
        this.snackBar.open('Error adding some issues', 'Close', {
          duration: 3000,
        });
      });
  }

  isIssueOwned(issue: any): boolean {
    return this.issues.some(
      (book) =>
        book.comicVineId === issue.id || book.issueNumber === issue.issueNumber
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
    return this.issues.reduce(
      (total, book) => total + (book.purchasePrice || 0),
      0
    );
  }

  calculateCurrentValue(): number {
    return this.issues.reduce(
      (total, book) => total + (book.currentValue || 0),
      0
    );
  }

  // Existing methods...
  addIssue(): void {
    const dialogRef = this.dialog.open(IssueFormComponent, {
      width: '600px',
      data: { seriesId: this.series!.id },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadIssues(this.series?.id!);
      }
    });
  }

  viewIssue(issueId: number): void {
    // Find the comic book in our current list
    const issue = this.issues.find((comic) => comic.id === issueId);
    if (issue) {
      const dialogRef = this.dialog.open(IssueViewDialog, {
        width: '700px',
        maxWidth: '90vw',
        data: { issue },
      });
    }
  }

  editIssue(issue: any): void {
    const dialogRef = this.dialog.open(IssueFormComponent, {
      width: '600px',
      data: { issue, seriesId: this.series!.id },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadIssues(this.series?.id!);
      }
    });
  }

  deleteIssue(id: number): void {
    if (confirm('Are you sure you want to delete this comic book?')) {
      this.issueService.deleteIssue(id).subscribe({
        next: () => {
          this.snackBar.open('Comic book deleted', 'Close', { duration: 3000 });
          this.loadIssues(this.series?.id!);
        },
        error: (error) => {
          console.error('Error deleting comic book:', error);
          this.snackBar.open('Error deleting comic book', 'Close', {
            duration: 3000,
          });
        },
      });
    }
  }

  addFromComicVine(issue: any): void {
    console.log('Adding issue from Comic Vine:', issue);
    const dialogRef = this.dialog.open(IssueFormComponent, {
      width: '600px',
      data: {
        seriesId: this.series?.id,
        comicVineIssue: issue,
      },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadIssues(this.series?.id!);
      }
    });
  }

  editSeries(): void {
    this.router.navigate(['/series', this.series?.id, 'edit']);
  }

  deleteSeries(): void {
    if (
      confirm(
        'Are you sure you want to delete this series and all its comic books?'
      )
    ) {
      this.seriesService.deleteSeries(this.series?.id!).subscribe({
        next: () => {
          this.snackBar.open('Series deleted', 'Close', { duration: 3000 });
          this.router.navigate(['/series']);
        },
        error: (error) => {
          console.error('Error deleting series:', error);
          this.snackBar.open('Error deleting series', 'Close', {
            duration: 3000,
          });
        },
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

  toggleCompactView(): void {
    this.isCompactView = !this.isCompactView;
  }

  addComicByImage(seriesId: number): void {
    // Open file input dialog to select image
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (event: any) => {
      const file = event.target.files[0];
      if (file) {
        // Show loading indicator
        this.snackBar.open('Analyzing image...', '', {
          duration: 0, // Keep open until dismissed
        });

        this.seriesService.addComicByImage(seriesId, file).subscribe({
          next: (response: ImageMatcherResponse) => {
            // Dismiss loading indicator
            this.snackBar.dismiss();

            if (
              response &&
              response.top_matches &&
              response.top_matches.length > 0
            ) {
              // Open the match selection dialog with the top matches
              this.openMatchSelectionDialog(response.top_matches, seriesId);
            } else {
              this.snackBar.open('No matching comics found', 'Close', {
                duration: 3000,
              });
            }
          },
          error: (error) => {
            // Dismiss loading indicator
            this.snackBar.dismiss();

            console.error('Error adding comic by image:', error);
            this.snackBar.open('Error analyzing image', 'Close', {
              duration: 3000,
            });
          },
        });
      }
    };
    input.click();
  }

  private openMatchSelectionDialog(
    matches: ComicMatch[],
    seriesId: number
  ): void {
    const dialogRef = this.dialog.open(ComicMatchSelectionComponent, {
      width: '900px',
      maxWidth: '95vw',
      data: {
        matches: matches,
        seriesId: seriesId,
      },
      disableClose: false,
    });

    console.log('Opening match selection dialog with matches:', matches);

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        switch (result.action) {
          case 'select':
            this.handleSelectedMatch(result.match, result.seriesId);
            break;
          case 'exists':
            this.handleExistingIssue(
              result.match,
              result.existingIssue,
              result.seriesId
            );
            break;
          case 'no_match':
            this.openManualAddDialog(result.seriesId);
            break;
          case 'cancel':
            // User cancelled, do nothing
            break;
        }
      }
    });
  }

  private handleExistingIssue(
    match: ComicMatch,
    existingIssue: any,
    seriesId: number
  ): void {
    // Show a confirmation dialog since the issue already exists
    const confirmDialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Comic Already Exists',
        message: `"${match.comic_name} #${match.issue_number}" is already in your collection. Do you want to add it again or view the existing issue?`,
        confirmText: 'Add Anyway',
        cancelText: 'View Existing',
        showThirdOption: true,
        thirdOptionText: 'Cancel',
      },
    });

    confirmDialogRef.afterClosed().subscribe((action) => {
      switch (action) {
        case 'confirm':
          // Add anyway - proceed with normal flow
          this.handleSelectedMatch(match, seriesId);
          break;
        case 'cancel':
          // View existing - open the issue for editing
          this.viewExistingIssue(existingIssue);
          break;
        case 'third':
        default:
          // Cancel - do nothing
          break;
      }
    });
  }

  private viewExistingIssue(existingIssue: any): void {
    // Open the issue form in edit mode
    const dialogRef = this.dialog.open(IssueFormComponent, {
      width: '600px',
      data: {
        seriesId: existingIssue.seriesId,
        issue: existingIssue,
      },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadIssues(existingIssue.seriesId);
        this.snackBar.open('Comic issue updated successfully', 'Close', {
          duration: 3000,
        });
      }
    });
  }

  private handleSelectedMatch(match: ComicMatch, seriesId: number): void {
    // Show loading indicator while fetching Comic Vine details
    this.snackBar.open('Fetching comic details...', '', {
      duration: 0, // Keep open until dismissed
    });

    console.log('Selected match:', match.parent_comic_vine_id);

    // Fetch full Comic Vine details for the matched issue
    this.comicVineService
      .getIssueById(match.parent_comic_vine_id ? match.parent_comic_vine_id.toString() : match.comic_vine_id!.toString())
      .subscribe({
        next: (issue: Issue) => {
          // Dismiss loading indicator
          this.snackBar.dismiss();
          
          if (match.parent_comic_vine_id) {
            issue.imageUrl = match.url;
            issue.variant = true;
          }

          if (issue) {
            const dialogRef = this.dialog.open(IssueFormComponent, {
              width: '600px',
              data: {
                seriesId: seriesId,
                comicVineIssue: issue
              },
            });

            dialogRef.afterClosed().subscribe((result) => {
              if (!result) return;

              if (result != "") {
                this.loadIssues(seriesId);
                this.snackBar.open('Comic issue added successfully', 'Close', {
                  duration: 3000,
                });
              }
            });
          } else {
            // If Comic Vine returns null, fall back to using match data only
            this.handleSelectedMatchFallback(match, seriesId);
          }
        },
        error: (error) => {
          // Dismiss loading indicator
          this.snackBar.dismiss();

          console.error('Error fetching issue details:', error);

          // Show user-friendly error and offer fallback
          this.snackBar.open(
            'Could not fetch comic details. Using basic info.',
            'Close',
            {
              duration: 3000,
            }
          );

          // Fall back to using just the match data
          this.handleSelectedMatchFallback(match, seriesId);
        },
      });
  }

  private handleSelectedMatchFallback(
    match: ComicMatch,
    seriesId: number
  ): void {

      const issue = {
        id: match.comic_vine_id || 0,
        name: match.comic_name,
        issueNumber: match.issue_number,
        imageUrl: match.url,
        thumbUrl: match.url,
        originalUrl: match.url,
      };
    // Fallback method when Comic Vine API fails - use just the match data
    const dialogRef = this.dialog.open(IssueFormComponent, {
      width: '600px',
      data: {
        seriesId: seriesId,
        comicVineIssue: issue
      },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadIssues(seriesId);
        this.snackBar.open('Comic issue added successfully', 'Close', {
          duration: 3000,
        });
      }
    });
  }

  private openManualAddDialog(seriesId: number): void {
    // Open the regular add issue dialog when user says none match
    const dialogRef = this.dialog.open(IssueFormComponent, {
      width: '600px',
      data: { seriesId: seriesId },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadIssues(seriesId);
        this.snackBar.open('Comic issue added successfully', 'Close', {
          duration: 3000,
        });
      }
    });
  }
}
