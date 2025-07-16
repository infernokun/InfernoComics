import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SeriesService, SSEProgressData } from '../../services/series.service';
import { IssueService } from '../../services/issue.service';
import { IssueFormComponent } from '../issue-form/issue-form.component';
import { ComicVineService } from '../../services/comic-vine.service';
import { Series } from '../../models/series.model';
import { ComicVineIssue } from '../../models/comic-vine.model';
import { RangeSelectionDialog } from './range-selection-dialog/range-selection-dialog';
import {
  ComicMatch,
  ComicMatchDialogData,
  ComicMatchSelectionComponent,
  ImageMatcherResponse,
} from './comic-match-selection/comic-match-selection.component';
import { IssueViewDialog } from './issue-view-dialog/issue-view-dialog.component';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../material.module';
import { ConfirmationDialogComponent } from '../common/dialog/confirmation-dialog/confirmation-dialog.component';
import { Issue } from '../../models/issue.model';
import { ImageProcessingDialogComponent } from './image-processing-progress/image-processing-progress.component';
import {
  BulkComicSelectionComponent,
  BulkSelectionDialogData,
  ProcessedImageResult,
} from './bulk-comic-selection/bulk-comic-selection.component';

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
  showFullDescription = false;

  readonly DESCRIPTION_LIMIT = 100;

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

  // ENHANCED IMAGE PROCESSING - Main entry point with SSE/fallback logic
  addComicByImage(seriesId: number): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (event: any) => {
      const file = event.target.files[0];
      if (file) {
        // Check if SSE is supported and use enhanced version, otherwise fallback
        if (this.seriesService.isSSESupported()) {
          this.processImageWithSSE(seriesId, file);
        } else {
          this.processImageFallback(seriesId, file);
        }
      }
    };
    input.click();
  }

  addComicsByImage(seriesId: number): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true; // Enable multiple file selection
    input.onchange = (event: any) => {
      const files: FileList = event.target.files;
      if (files && files.length > 0) {
        // Convert FileList to Array for easier processing
        const fileArray = Array.from(files);

        // Check if SSE is supported and use enhanced version, otherwise fallback
        if (this.seriesService.isSSESupported()) {
          this.processMultipleImagesWithSSE(seriesId, fileArray);
        } else {
          this.processMultipleImagesFallback(seriesId, fileArray);
        }
      }
    };
    input.click();
  }

  private processMultipleImagesWithSSE(seriesId: number, files: File[]): void {
    // Open the progress dialog
    const progressDialogRef = this.dialog.open(ImageProcessingDialogComponent, {
      width: '600px',
      maxWidth: '90vw',
      disableClose: true,
      data: {
        files: files,
        seriesId: seriesId,
        isMultiple: true, // Add flag to indicate multiple files
      },
    });

    const dialogComponent = progressDialogRef.componentInstance;

    this.seriesService.addComicsByImagesWithSSE(seriesId, files).subscribe({
      next: (progressData: SSEProgressData) => {
        this.handleMultipleSSEProgress(
          seriesId,
          progressData,
          dialogComponent,
          files
        );
      },
      error: (error) => {
        console.error('SSE Error:', error);
        const errorMessage = this.getErrorMessage(error);
        dialogComponent.setError(errorMessage);
      },
      complete: () => {
        console.log('SSE multiple images stream completed');
      },
    });
  }

  private handleMultipleSSEProgress(
    seriesId: number,
    data: SSEProgressData,
    dialogComponent: ImageProcessingDialogComponent,
    originalImages: File[]
  ): void {
    console.log('=== MULTIPLE SSE EVENT ===');
    console.log('Event type:', data.type);
    console.log('Event data:', data);

    switch (data.type) {
      case 'progress':
        const stageName = this.getStageDisplayName(data.stage || '');

        // Better progress message handling for multi-image
        let progressMessage = data.message;
        if (progressMessage) {
          progressMessage = progressMessage.replace(/^\w+:\s*/, '');
          console.log(
            ` Multi-image progress: ${data.progress}% - ${progressMessage}`
          );
        }

        dialogComponent.updateProgress(
          stageName,
          data.progress || 0,
          progressMessage
        );
        break;

      case 'complete':
        console.log(
          ' FRONTEND: Received COMPLETION EVENT for multiple images!'
        );
        console.log('Completion result:', data.result);

        dialogComponent.setComplete(data.result);

        // Handle the results after dialog auto-closes
        setTimeout(() => {
          const result = data.result as any;

          console.log(' Processing completion result:', result);

          // Handle multiple images result format
          if (result && result.results && Array.isArray(result.results)) {
            console.log('✅ Processing multiple images result format');
            console.log('Number of image results:', result.results.length);

            // Use the new bulk selection dialog instead of flattening matches
            this.openBulkSelectionDialog(result, seriesId, originalImages);
          } else if (
            result &&
            result.top_matches &&
            Array.isArray(result.top_matches)
          ) {
            // Single image result format (fallback)
            console.log('✅ Processing single image result format (fallback)');
            this.openMatchSelectionDialog(
              result.top_matches,
              seriesId,
              originalImages.length > 0 ? originalImages[0] : undefined,
              result.session_id
            );
          } else {
            console.log('❌ Unexpected result format:', result);
            this.snackBar.open(
              'Processing completed but no results found',
              'Close',
              { duration: 3000 }
            );
          }
        }, 1600);
        break;

      case 'error':
        console.error('❌ SSE Error received:', data.error);
        dialogComponent.setError(data.error || 'Unknown error occurred');
        this.snackBar.open(
          `Error processing images: ${data.error || 'Unknown error'}`,
          'Close',
          { duration: 5000 }
        );
        break;

      default:
        console.log('❓ Unknown SSE event type:', data.type);
        break;
    }
  }

  private openBulkSelectionDialog(
    result: any,
    seriesId: number,
    originalImages: File[]
  ): void {
    console.log(' Opening bulk selection dialog');
    console.log('Result:', result);

    // Flatten all matches from all images with source tracking
    const allMatches: ComicMatch[] = [];

    result.results.forEach((imageResult: any, imageIndex: number) => {
      console.log(
        `Processing image result ${imageIndex}:`,
        imageResult.image_name,
        'matches:',
        imageResult.top_matches?.length || 0
      );

      if (imageResult.top_matches && Array.isArray(imageResult.top_matches)) {
        imageResult.top_matches.forEach((match: any) => {
          // Add source tracking to each match
          match.sourceImageIndex =
            imageResult.image_index !== undefined
              ? imageResult.image_index
              : imageIndex;
          match.sourceImageName =
            imageResult.image_name ||
            originalImages[imageIndex]?.name ||
            `Image ${imageIndex + 1}`;
          allMatches.push(match);
        });
      }
    });

    console.log(' Total matches for bulk selection:', allMatches.length);

    if (allMatches.length === 0) {
      console.log('❌ No matches found in any images');
      const summary = result.summary;
      if (summary && summary.total_images_processed > 0) {
        this.snackBar.open(
          `Processed ${summary.total_images_processed} images but found no matching comics`,
          'Close',
          { duration: 5000 }
        );
      } else {
        this.snackBar.open('No matching comics found in any images', 'Close', {
          duration: 3000,
        });
      }
      return;
    }

    // Open the new bulk selection dialog
    const dialogData: BulkSelectionDialogData = {
      matches: allMatches,
      seriesId: seriesId,
      sessionId: result.session_id,
      originalImages: originalImages,
      isMultiple: true,
      highConfidenceThreshold: 0.25,
      mediumConfidenceThreshold: 0.15,
      autoSelectHighConfidence: true,
    };

    const dialogRef = this.dialog.open(BulkComicSelectionComponent, {
      width: '95vw',
      maxWidth: '1200px',
      maxHeight: '95vh',
      data: dialogData,
      disableClose: false,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result && result.action === 'bulk_add') {
        console.log('✅ Bulk add selected:', result.results.length, 'comics');
        this.handleBulkAddResults(result.results, seriesId);
      } else if (result && result.action === 'save') {
        console.log(' Save selections:', result.results);
        // Handle save logic if needed
      } else {
        console.log(' User cancelled bulk selection');
      }
    });
  }

  private handleBulkAddResults(
    results: ProcessedImageResult[],
    seriesId: number
  ): void {
    console.log(' Processing bulk add for', results.length, 'comics');

    // Show loading indicator
    this.snackBar.open(`Adding ${results.length} comics to collection...`, '', {
      duration: 0,
    });

    // Process each accepted result
    const addPromises = results.map(async (result) => {
      if (result.userAction === 'accepted' && result.selectedMatch) {
        const match = result.selectedMatch;

        try {
          // Fetch Comic Vine details for the match
          const issue = await this.comicVineService
            .getIssueById(
              match.parent_comic_vine_id
                ? match.parent_comic_vine_id.toString()
                : match.comic_vine_id!.toString()
            )
            .toPromise();

          if (issue) {
            // Prepare issue data
            if (match.parent_comic_vine_id) {
              issue.imageUrl = match.url;
              issue.variant = true;
            }

            // Create the issue
            const issueData = {
              seriesId: seriesId,
              issueNumber: issue.issueNumber,
              title: issue.title,
              description: issue.description,
              coverDate: issue.coverDate,
              imageUrl: issue.imageUrl,
              comicVineId: issue.id,
              condition: 'VERY_FINE',
              purchasePrice: 0,
              currentValue: 0,
              keyIssue: false,
              generatedDescription: issue.generatedDescription || false,
              variant: issue.variant || false,
            };

            return this.issueService.createIssue(issueData).toPromise();
          }
        } catch (error) {
          console.error(
            'Error processing match for',
            result.imageName,
            ':',
            error
          );
          return Promise.reject(error);
        }
      }
    });

    Promise.allSettled(addPromises)
      .then((results) => {
        this.snackBar.dismiss();

        const successful = results.filter(
          (r) => r.status === 'fulfilled'
        ).length;
        const failed = results.filter((r) => r.status === 'rejected').length;

        if (successful > 0) {
          this.snackBar.open(
            `Successfully added ${successful} comics to collection${
              failed > 0 ? ` (${failed} failed)` : ''
            }`,
            'Close',
            { duration: 5000 }
          );

          // Refresh the issues list
          this.loadIssues(seriesId);
        } else {
          this.snackBar.open('Failed to add comics to collection', 'Close', {
            duration: 3000,
          });
        }
      })
      .catch((error) => {
        this.snackBar.dismiss();
        console.error('Error in bulk add:', error);
        this.snackBar.open('Error adding comics to collection', 'Close', {
          duration: 3000,
        });
      });
  }

  private processMultipleImagesFallback(seriesId: number, files: File[]): void {
    this.snackBar.open(`Analyzing ${files.length} images...`, '', {
      duration: 0,
    });

    const processPromises = files.map((file) =>
      this.seriesService.addComicByImage(seriesId, file).toPromise()
    );

    Promise.allSettled(processPromises)
      .then((results) => {
        this.snackBar.dismiss();

        const successfulResults = results
          .filter((result) => result.status === 'fulfilled')
          .map(
            (result) =>
              (result as PromiseFulfilledResult<ImageMatcherResponse>).value
          );

        const failedCount = results.filter(
          (result) => result.status === 'rejected'
        ).length;

        if (successfulResults.length > 0) {
          // FIXED: Pass the files parameter
          this.handleMultipleImageResults(
            successfulResults,
            seriesId,
            failedCount,
            files // ADD THIS parameter
          );
        } else {
          this.snackBar.open(
            'No matching comics found in any images',
            'Close',
            {
              duration: 3000,
            }
          );
        }
      })
      .catch((error) => {
        this.snackBar.dismiss();
        console.error('Error analyzing images:', error);
        this.snackBar.open('Error analyzing images', 'Close', {
          duration: 3000,
        });
      });
  }

  private handleMultipleImageResults(
    results: ImageMatcherResponse[],
    seriesId: number,
    failedCount: number,
    originalImages?: File[] // ADD THIS parameter to method signature
  ): void {
    const allMatches: ComicMatch[] = [];

    results.forEach((response, index) => {
      if (response?.top_matches?.length > 0) {
        response.top_matches.forEach((match) => {
          (match as any).sourceImageIndex = index;
          allMatches.push(match);
        });
      }
    });

    if (allMatches.length > 0) {
      // FIXED: Add missing parameters
      this.openMatchSelectionDialog(
        allMatches,
        seriesId,
        originalImages, // ADD THIS
        results[0]?.session_id // ADD THIS
      );

      let message = `Found matches in ${results.length} images`;
      if (failedCount > 0) {
        message += `, ${failedCount} failed to process`;
      }
      this.snackBar.open(message, 'Close', { duration: 5000 });
    } else {
      this.snackBar.open('No matching comics found in any images', 'Close', {
        duration: 3000,
      });
    }
  }

  // NEW SSE-BASED PROCESSING - Real-time progress updates
  private processImageWithSSE(seriesId: number, file: File): void {
    // Open the progress dialog
    const progressDialogRef = this.dialog.open(ImageProcessingDialogComponent, {
      width: '600px',
      maxWidth: '90vw',
      disableClose: true,
      data: {
        file: file,
        seriesId: seriesId,
      },
    });

    const dialogComponent = progressDialogRef.componentInstance;

    // Start SSE-based processing
    this.seriesService.addComicByImageWithSSE(seriesId, file).subscribe({
      next: (progressData: SSEProgressData) => {
        this.handleSSEProgress(seriesId, progressData, dialogComponent, file);
      },
      error: (error) => {
        console.error('SSE Error:', error);
        const errorMessage = this.getErrorMessage(error);
        dialogComponent.setError(errorMessage);
      },
      complete: () => {
        console.log('SSE stream completed');
      },
    });
  }

  private handleSSEProgress(
    seriesId: number,
    data: SSEProgressData,
    dialogComponent: ImageProcessingDialogComponent,
    originalImage: File
  ): void {
    switch (data.type) {
      case 'progress':
        const stageName = this.getStageDisplayName(data.stage || '');
        dialogComponent.updateProgress(
          stageName,
          data.progress || 0,
          data.message
        );
        break;

      case 'complete':
        dialogComponent.setComplete(data.result);

        // Handle the results after dialog auto-closes
        setTimeout(() => {
          // Cast the result to ImageMatcherResponse for proper typing
          const imageMatcherResponse = data.result as ImageMatcherResponse;

          if (
            imageMatcherResponse &&
            imageMatcherResponse.top_matches &&
            imageMatcherResponse.top_matches.length > 0
          ) {
            console.log(
              'SSE Processing completed successfully, opening match selection dialog'
            );
            console.log(
              'Top matches found:',
              imageMatcherResponse.top_matches.length
            );

            // Use the same method as fallback processing
            this.openMatchSelectionDialog(
              imageMatcherResponse.top_matches,
              seriesId,
              originalImage,
              imageMatcherResponse.session_id
            );
          } else {
            console.log(
              'No matches found in SSE result:',
              imageMatcherResponse
            );
            this.snackBar.open('No matching comics found', 'Close', {
              duration: 3000,
            });
          }
        }, 1600);
        break;

      case 'error':
        console.error('SSE Error received:', data.error);
        dialogComponent.setError(data.error || 'Unknown error occurred');
        break;

      default:
        console.log('Unknown SSE event type:', data.type);
        break;
    }
  }

  private getStageDisplayName(stage: string): string {
    const stageMap: { [key: string]: string } = {
      preparing: 'Preparing image analysis',
      processing_data: 'Processing image data',
      initializing: 'Initializing image matcher',
      initializing_matcher: 'Initializing image matcher',
      extracting_features: 'Extracting image features',
      preparing_comparison: 'Preparing comparison',
      comparing_images: 'Comparing with database',
      processing_results: 'Processing results',
      finalizing: 'Finalizing matches',
      complete: 'Analysis complete',
    };

    return (
      stageMap[stage] ||
      stage.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
    );
  }

  // FALLBACK PROCESSING - Original method with simulated progress (backward compatibility)
  private processImageFallback(seriesId: number, file: File): void {
    this.snackBar.open('Analyzing image...', '', {
      duration: 0,
    });

    this.seriesService.addComicByImage(seriesId, file).subscribe({
      next: (response: ImageMatcherResponse) => {
        this.snackBar.dismiss();

        if (
          response &&
          response.top_matches &&
          response.top_matches.length > 0
        ) {
          // FIXED: Add missing file and sessionId parameters
          this.openMatchSelectionDialog(
            response.top_matches,
            seriesId,
            file, // ADD THIS
            response.session_id // ADD THIS
          );
        } else {
          this.snackBar.open('No matching comics found', 'Close', {
            duration: 3000,
          });
        }
      },
      error: (error) => {
        this.snackBar.dismiss();
        console.error('Error adding comic by image:', error);
        this.snackBar.open('Error analyzing image', 'Close', {
          duration: 3000,
        });
      },
    });
  }

  private getErrorMessage(error: any): string {
    if (error.status === 400) {
      return 'Invalid image file or format';
    } else if (error.status === 413) {
      return 'Image file is too large';
    } else if (error.status === 500) {
      return 'Server error during image analysis';
    } else if (error.status === 0) {
      return 'Network connection error';
    } else if (error.error?.message) {
      return error.error.message;
    } else if (error.message) {
      return error.message;
    }
    return 'Failed to analyze image';
  }

  // Fixed method signature to handle all the different ways it's called
  private openMatchSelectionDialog(
    matches: ComicMatch[],
    seriesId: number,
    originalImage?: File | File[],
    sessionId?: string
  ): void {
    console.log('🎭 Opening match selection dialog');
    console.log('Matches:', matches.length);
    console.log(
      'Original image type:',
      Array.isArray(originalImage) ? 'multiple' : 'single'
    );
    console.log('Session ID:', sessionId);

    const dialogData: ComicMatchDialogData = {
      matches: matches,
      seriesId: seriesId,
      sessionId: sessionId || undefined,
      isMultiple: Array.isArray(originalImage) && originalImage.length > 1,
      originalImages: Array.isArray(originalImage) ? originalImage : undefined,
      originalImage: Array.isArray(originalImage)
        ? originalImage[0]
        : originalImage,
    };

    console.log('📋 Dialog data:', dialogData);

    const dialogRef = this.dialog.open(ComicMatchSelectionComponent, {
      width: '95vw',
      maxWidth: '1200px',
      maxHeight: '90vh',
      data: dialogData,
      disableClose: false,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result && result.action === 'select') {
        console.log('✅ User selected match:', result.match);
        this.handleSelectedMatch(result.match, seriesId);
      } else if (result && result.action === 'no_match') {
        console.log('❌ User selected no match');
        this.openManualAddDialog(seriesId);
      } else {
        console.log('🚫 User cancelled match selection');
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
      .getIssueById(
        match.parent_comic_vine_id
          ? match.parent_comic_vine_id.toString()
          : match.comic_vine_id!.toString()
      )
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
                comicVineIssue: issue,
              },
            });

            dialogRef.afterClosed().subscribe((result) => {
              if (!result) return;

              if (result != '') {
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
        comicVineIssue: issue,
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

  get limitedDescription(): string {
    if (!this.series?.description) return '';
    if (this.showFullDescription) return this.series.description;
    if (this.series.description.length <= this.DESCRIPTION_LIMIT)
      return this.series.description;

    return this.series.description.substring(0, this.DESCRIPTION_LIMIT) + '...';
  }

  toggleDescription(): void {
    this.showFullDescription = !this.showFullDescription;
  }
}
