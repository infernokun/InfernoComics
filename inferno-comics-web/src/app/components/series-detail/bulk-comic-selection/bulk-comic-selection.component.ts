import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import {
  MatDialogRef,
  MAT_DIALOG_DATA,
  MatDialog,
} from '@angular/material/dialog';
import { MaterialModule } from '../../../material.module';
import {
  ComicMatchSelectionComponent,
  ComicMatchDialogData,
} from '../comic-match-selection/comic-match-selection.component';
import { ComicMatch } from '../../../models/comic-match.model';

export interface ProcessedImageResult {
  imageIndex: number;
  imageName: string;
  imagePreview: string;
  bestMatch: ComicMatch | null;
  allMatches: ComicMatch[];
  status: 'auto_selected' | 'needs_review' | 'no_match' | 'skipped';
  confidence: 'high' | 'medium' | 'low';
  userAction?: 'accepted' | 'rejected' | 'manual_select';
  selectedMatch?: ComicMatch;
}

export interface BulkSelectionDialogData {
  matches: ComicMatch[];
  seriesId: number;
  sessionId?: string;
  originalImages: File[];
  storedImages?: any[];
  isMultiple: boolean;
  highConfidenceThreshold: number;
  mediumConfidenceThreshold: number;
  autoSelectHighConfidence: boolean;
}

@Component({
  selector: 'app-bulk-comic-selection',
  templateUrl: './bulk-comic-selection.component.html',
  styleUrls: ['./bulk-comic-selection.component.scss'],
  imports: [CommonModule, MaterialModule],
})
export class BulkComicSelectionComponent implements OnInit, OnDestroy {
  processedResults: ProcessedImageResult[] = [];
  filteredResults: ProcessedImageResult[] = [];
  currentFilter: 'all' | 'auto_selected' | 'needs_review' | 'no_match' = 'all';

  private imagePreviewUrls: string[] = [];
  private highConfidenceThreshold: number = 0.7;
  private mediumConfidenceThreshold: number = 0.55;
  private isSessionData: boolean = false;

  constructor(
    public dialogRef: MatDialogRef<BulkComicSelectionComponent>,
    private dialog: MatDialog,
    @Inject(MAT_DIALOG_DATA) public data: BulkSelectionDialogData
  ) {
    this.highConfidenceThreshold = data.highConfidenceThreshold || 0.7;
    this.mediumConfidenceThreshold = data.mediumConfidenceThreshold || 0.55;

    // Determine if we're working with session data or live files
    this.isSessionData = !!(data.storedImages && data.storedImages.length > 0);

    // Ensure we have either originalImages or storedImages
    if (!this.data.originalImages) {
      this.data.originalImages = [];
    }
    if (!this.data.storedImages) {
      this.data.storedImages = [];
    }
  }

  ngOnInit(): void {
    this.createImagePreviews();
    this.processMatches();
    this.applyFilter();
  }

  ngOnDestroy(): void {
    if (!this.isSessionData) {
      this.imagePreviewUrls.forEach((url) => {
        if (url && url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    }
  }

  private createImagePreviews(): void {
    if (this.isSessionData && this.data.storedImages!.length > 0) {
      // Use stored images from session data
      this.imagePreviewUrls = this.data.storedImages!.map(
        (storedImage) => storedImage.javaUrl
      );
      console.log('🖼️ Using stored image URLs:', this.imagePreviewUrls);
    } else if (
      this.data.originalImages &&
      this.data.originalImages.length > 0
    ) {
      // Use original uploaded files
      this.imagePreviewUrls = this.data.originalImages.map((file) =>
        URL.createObjectURL(file)
      );
      console.log('🖼️ Using original file URLs:', this.imagePreviewUrls.length);
    } else {
      // No images available
      this.imagePreviewUrls = [];
      console.log('⚠️ No image sources available');
    }
  }

  private processMatches(): void {
    console.log('🔄 Processing matches in bulk selection component');
    console.log('Data matches length:', this.data.matches.length);
    console.log('Is session data:', this.isSessionData);

    // Group matches by source image
    const groupedMatches: { [key: number]: ComicMatch[] } = {};

    this.data.matches.forEach((match) => {
      const sourceIndex = match.sourceImageIndex ?? 0;
      if (!groupedMatches[sourceIndex]) {
        groupedMatches[sourceIndex] = [];
      }
      groupedMatches[sourceIndex].push(match);
    });

    console.log('📊 Grouped matches:', groupedMatches);

    // Determine image count
    let imageCount = 0;
    if (this.isSessionData) {
      imageCount = this.data.storedImages!.length;
    } else {
      imageCount =
        this.data.originalImages?.length ||
        Math.max(...Object.keys(groupedMatches).map((k) => parseInt(k))) + 1;
    }

    console.log('📊 Processing', imageCount, 'images');

    // Process each image
    for (let index = 0; index < imageCount; index++) {
      const matches = groupedMatches[index] || [];
      const sortedMatches = matches.sort((a, b) => b.similarity - a.similarity);
      const bestMatch = sortedMatches[0] || null;

      let status: ProcessedImageResult['status'] = 'no_match';
      let confidence: ProcessedImageResult['confidence'] = 'low';

      if (bestMatch) {
        if (bestMatch.similarity >= this.highConfidenceThreshold) {
          confidence = 'high';
          status = 'auto_selected';
        } else if (bestMatch.similarity >= this.mediumConfidenceThreshold) {
          confidence = 'medium';
          status = 'needs_review';
        } else {
          confidence = 'low';
          status = 'needs_review';
        }
      }

      // Get image name and preview URL
      let imageName: string;
      let imagePreview: string;

      if (this.isSessionData && this.data.storedImages![index]) {
        imageName = this.data.storedImages![index].name;
        imagePreview = this.imagePreviewUrls[index];
      } else {
        imageName =
          bestMatch?.sourceImageName ||
          this.data.originalImages?.[index]?.name ||
          `Image ${index + 1}`;
        imagePreview =
          this.imagePreviewUrls[index] ||
          bestMatch?.local_url ||
          bestMatch?.url ||
          'assets/images/no-image-placeholder.png';
      }

      this.processedResults.push({
        imageIndex: index,
        imageName: imageName,
        imagePreview: imagePreview,
        bestMatch,
        allMatches: sortedMatches,
        status,
        confidence,
      });
    }

    console.log('✅ Processed results:', this.processedResults);
  }

  onFilterChange(
    newFilter: 'all' | 'auto_selected' | 'needs_review' | 'no_match'
  ): void {
    console.log('Filter changed to:', newFilter); 
    this.currentFilter = newFilter;
    this.applyFilter();
  }

  applyFilter(): void {
    console.log('Applying filter:', this.currentFilter);
    console.log('ProcessedResults count:', this.processedResults.length);
    console.log(
      'ProcessedResults statuses:',
      this.processedResults.map((r) => `${r.imageName}: ${r.status}`)
    );

    switch (this.currentFilter) {
      case 'all':
        this.filteredResults = [...this.processedResults];
        break;
      case 'auto_selected':
        this.filteredResults = this.processedResults.filter(
          (r) => r.status === 'auto_selected'
        );
        break;
      case 'needs_review':
        this.filteredResults = this.processedResults.filter(
          (r) => r.status === 'needs_review'
        );
        break;
      case 'no_match':
        this.filteredResults = this.processedResults.filter(
          (r) => r.status === 'no_match'
        );
        break;
    }

    console.log('Filtered results count:', this.filteredResults.length);
  }

  // Action Methods
  acceptMatch(result: ProcessedImageResult): void {
    result.userAction = 'accepted';
    result.selectedMatch =
      result.selectedMatch || (result.bestMatch ?? undefined);
  }

  rejectMatch(result: ProcessedImageResult): void {
    result.userAction = 'rejected';
    result.selectedMatch = undefined;
  }

  reviewMatch(result: ProcessedImageResult): void {
    // Create dialog data for the individual match selection
    const dialogData: ComicMatchDialogData = {
      matches: result.allMatches,
      seriesId: this.data.seriesId,
      sessionId: this.data.sessionId,
      originalImage: this.data.originalImages[result.imageIndex],
      isMultiple: false, 
    };

    // Open the individual match selection dialog
    const dialogRef = this.dialog.open(ComicMatchSelectionComponent, {
      width: '95vw',
      maxWidth: '1200px',
      maxHeight: '90vh',
      data: dialogData,
      disableClose: false,
    });

    // Handle the result from the individual match selection
    dialogRef.afterClosed().subscribe((dialogResult) => {
      if (dialogResult && dialogResult.action === 'select') {
        // User selected a match
        result.userAction = 'manual_select';
        result.selectedMatch = dialogResult.match;
        result.status = 'auto_selected'; // Update status to show it's been handled
      } else if (dialogResult && dialogResult.action === 'no_match') {
        // User chose no match
        result.userAction = 'rejected';
        result.selectedMatch = undefined;
        result.status = 'no_match';

        console.log('User rejected all matches for:', result.imageName);
      } else if (dialogResult && dialogResult.action === 'cancel') {
        // User cancelled - no changes
        console.log('User cancelled match selection for:', result.imageName);
      }

      // Refresh the filtered results to reflect any changes
      this.applyFilter();
    });
  }

  showAllMatches(result: ProcessedImageResult): void {
    // Similar to reviewMatch but with a different context
    const dialogData: ComicMatchDialogData = {
      matches: result.allMatches,
      seriesId: this.data.seriesId,
      sessionId: this.data.sessionId,
      originalImage: this.data.originalImages[result.imageIndex],
      isMultiple: false,
    };

    const dialogRef = this.dialog.open(ComicMatchSelectionComponent, {
      width: '95vw',
      maxWidth: '1200px',
      maxHeight: '90vh',
      data: dialogData,
      disableClose: false,
    });

    dialogRef.afterClosed().subscribe((dialogResult) => {
      if (dialogResult && dialogResult.action === 'select') {
        result.userAction = 'manual_select';
        result.selectedMatch = dialogResult.match;
        result.status = 'auto_selected';
      } else if (dialogResult && dialogResult.action === 'no_match') {
        result.userAction = 'rejected';
        result.selectedMatch = undefined;
        result.status = 'no_match';
      }

      this.applyFilter();
    });
  }

  manualAdd(result: ProcessedImageResult): void {
    // This would open a manual comic addition dialog
    // For now, we'll mark it as skipped and let the parent handle it
    result.userAction = 'rejected';
    result.selectedMatch = undefined;
    result.status = 'skipped';

    console.log('Manual add requested for:', result.imageName);

    // emit an event or call a service here to handle the manual addition workflow
    this.applyFilter();
  }

  acceptAllAutoSelected(): void {
    this.processedResults
      .filter((r) => r.status === 'auto_selected')
      .forEach((r) => this.acceptMatch(r));
  }

  reviewAllMatches(): void {
    // Switch to review view
    this.currentFilter = 'needs_review';
    this.applyFilter();
  }

  skipLowConfidence(): void {
    this.processedResults
      .filter((r) => r.confidence === 'low')
      .forEach((r) => {
        r.userAction = 'rejected';
        r.selectedMatch = undefined;
      });
  }

  addAllAccepted(): void {
    const acceptedResults = this.processedResults.filter(
      (r) => r.userAction === 'accepted' || r.userAction === 'manual_select'
    );

    this.dialogRef.close({
      action: 'bulk_add',
      results: acceptedResults,
      seriesId: this.data.seriesId,
    });
  }

  saveSelections(): void {
    this.dialogRef.close({
      action: 'save',
      results: this.processedResults,
      seriesId: this.data.seriesId,
    });
  }

  onCancel(): void {
    this.dialogRef.close({ action: 'cancel' });
  }

  // Helper Methods
  getAutoSelectedCount(): number {
    return this.processedResults.filter((r) => r.status === 'auto_selected')
      .length;
  }

  getNeedsReviewCount(): number {
    return this.processedResults.filter((r) => r.status === 'needs_review')
      .length;
  }

  getNoMatchCount(): number {
    return this.processedResults.filter((r) => r.status === 'no_match').length;
  }

  getAcceptedCount(): number {
    return this.processedResults.filter(
      (r) => r.userAction === 'accepted' || r.userAction === 'manual_select'
    ).length;
  }

  getRejectedCount(): number {
    return this.processedResults.filter((r) => r.userAction === 'rejected')
      .length;
  }

  getPendingCount(): number {
    return this.processedResults.filter((r) => !r.userAction).length;
  }

  hasAcceptedMatches(): boolean {
    return this.getAcceptedCount() > 0;
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'auto_selected':
        return 'Auto-Selected';
      case 'needs_review':
        return 'Needs Review';
      case 'no_match':
        return 'No Match';
      case 'skipped':
        return 'Skipped';
      default:
        return 'Unknown';
    }
  }

  getConfidenceIcon(confidence: string): string {
    switch (confidence) {
      case 'high':
        return 'star';
      case 'medium':
        return 'star_half';
      case 'low':
        return 'star_border';
      default:
        return 'help';
    }
  }

  // New helper methods for better UX
  canReviewMatch(result: ProcessedImageResult): boolean {
    return result.allMatches.length > 0;
  }

  canShowAllMatches(result: ProcessedImageResult): boolean {
    return result.allMatches.length > 1;
  }

  getMatchCountText(result: ProcessedImageResult): string {
    const count = result.allMatches.length;
    if (count === 0) return 'No matches';
    if (count === 1) return '1 match';
    return `${count} matches`;
  }

  getStatusColor(result: ProcessedImageResult): string {
    switch (result.status) {
      case 'auto_selected':
        return 'primary';
      case 'needs_review':
        return 'warn';
      case 'no_match':
        return 'accent';
      case 'skipped':
        return 'basic';
      default:
        return 'basic';
    }
  }

  getUserActionText(result: ProcessedImageResult): string {
    switch (result.userAction) {
      case 'accepted':
        return 'Accepted';
      case 'rejected':
        return 'Rejected';
      case 'manual_select':
        return 'Manually Selected';
      default:
        return 'Pending';
    }
  }

  getConfidenceText(similarity: number): string {
    if (similarity >= this.highConfidenceThreshold) return 'High Confidence';
    if (similarity >= this.mediumConfidenceThreshold)
      return 'Medium Confidence';
    return 'Low Confidence';
  }

  resetUserAction(result: ProcessedImageResult): void {
    result.userAction = undefined;
    result.selectedMatch = result.bestMatch ?? undefined;

    // Reset to original status based on confidence
    if (result.bestMatch) {
      if (result.bestMatch.similarity >= this.highConfidenceThreshold) {
        result.status = 'auto_selected';
      } else {
        result.status = 'needs_review';
      }
    } else {
      result.status = 'no_match';
    }

    this.applyFilter();
  }

  onImageError(event: any): void {
    event.target.src = 'assets/images/no-cover-placeholder.png';
  }
}