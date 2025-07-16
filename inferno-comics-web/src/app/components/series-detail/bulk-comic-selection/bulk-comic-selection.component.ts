import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MaterialModule } from '../../../material.module';
import { Issue } from '../../../models/issue.model';

export interface ComicMatch {
  session_id: string;
  url: string;
  similarity: number;
  status: string;
  match_details: {
    orb: { good_matches: number; similarity: number; total_matches: number };
    sift: { good_matches: number; similarity: number; total_matches: number };
  };
  candidate_features: { orb_count: number; sift_count: number };
  comic_name: string;
  issue_number: string;
  comic_vine_id: number | null;
  cover_error: string;
  issue: Issue | null;
  parent_comic_vine_id: number | null;
  sourceImageIndex?: number;
  sourceImageName?: string;
}

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
  isMultiple: boolean;
  // Thresholds for auto-selection
  highConfidenceThreshold?: number; // Default: 0.25
  mediumConfidenceThreshold?: number; // Default: 0.15
  autoSelectHighConfidence?: boolean; // Default: true
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
  private highConfidenceThreshold = 0.25;
  private mediumConfidenceThreshold = 0.15;

  constructor(
    public dialogRef: MatDialogRef<BulkComicSelectionComponent>,
    @Inject(MAT_DIALOG_DATA) public data: BulkSelectionDialogData
  ) {
    this.highConfidenceThreshold = data.highConfidenceThreshold || 0.25;
    this.mediumConfidenceThreshold = data.mediumConfidenceThreshold || 0.15;
  }

  ngOnInit(): void {
    this.createImagePreviews();
    this.processMatches();
    this.applyFilter();
  }

  ngOnDestroy(): void {
    this.imagePreviewUrls.forEach((url) => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    });
  }

  private createImagePreviews(): void {
    this.imagePreviewUrls = this.data.originalImages.map((file) =>
      URL.createObjectURL(file)
    );
  }

  private processMatches(): void {
    // Group matches by source image
    const groupedMatches: { [key: number]: ComicMatch[] } = {};

    this.data.matches.forEach((match) => {
      const sourceIndex = match.sourceImageIndex ?? 0;
      if (!groupedMatches[sourceIndex]) {
        groupedMatches[sourceIndex] = [];
      }
      groupedMatches[sourceIndex].push(match);
    });

    // Process each image
    this.data.originalImages.forEach((file, index) => {
      const matches = groupedMatches[index] || [];
      const sortedMatches = matches.sort((a, b) => b.similarity - a.similarity);
      const bestMatch = sortedMatches[0] || null;

      let status: ProcessedImageResult['status'] = 'no_match';
      let confidence: ProcessedImageResult['confidence'] = 'low';

      if (bestMatch) {
        // Determine confidence level
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

      this.processedResults.push({
        imageIndex: index,
        imageName: file.name,
        imagePreview: this.imagePreviewUrls[index],
        bestMatch,
        allMatches: sortedMatches,
        status,
        confidence,
      });
    });
  }

  applyFilter(): void {
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
  }

  // Action Methods
  acceptMatch(result: ProcessedImageResult): void {
    result.userAction = 'accepted';
    result.selectedMatch = result.bestMatch!;
  }

  rejectMatch(result: ProcessedImageResult): void {
    result.userAction = 'rejected';
    result.selectedMatch = undefined;
  }

  reviewMatch(result: ProcessedImageResult): void {
    // Open individual match selection dialog for this image
    // This would open the existing single-image match selection
    console.log('Review match for:', result.imageName);
    // TODO: Open single image match dialog
  }

  showAllMatches(result: ProcessedImageResult): void {
    // Show all matches for this specific image
    console.log(
      'Show all matches for:',
      result.imageName,
      result.allMatches.length
    );
    // TODO: Open expanded view for this image
  }

  manualAdd(result: ProcessedImageResult): void {
    // Open manual add dialog
    console.log('Manual add for:', result.imageName);
    // TODO: Open manual add dialog
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
      (r) => r.userAction === 'accepted'
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
    return this.processedResults.filter((r) => r.userAction === 'accepted')
      .length;
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

  onImageError(event: any): void {
    event.target.src = 'assets/images/no-cover-placeholder.png';
  }
}
