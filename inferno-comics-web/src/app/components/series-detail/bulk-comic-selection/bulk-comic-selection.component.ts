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
  liveStoredImage?: any;
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
  liveStoredImages?: any[];
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
  currentFilter: 'all' | 'auto_selected' | 'needs_review' | 'no_match' | 'rejected' = 'all';


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
        liveStoredImage: this.data.liveStoredImages ? this.data.liveStoredImages![index] : null,
        bestMatch,
        allMatches: sortedMatches,
        status,
        confidence,
      });
    }

    console.log('✅ Processed results:', this.processedResults);
  }

  onFilterChange(
    newFilter: 'all' | 'auto_selected' | 'needs_review' | 'no_match' | 'rejected'
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
      case 'rejected':
        this.filteredResults = this.processedResults.filter(
          (r) => r.userAction === 'rejected'
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

  acceptMatch(result: ProcessedImageResult): void {
    result.userAction = 'accepted';
    result.selectedMatch = result.selectedMatch || (result.bestMatch ?? undefined);
    console.log('✅ Accepted match for:', result.imageName);
  }

  rejectMatch(result: ProcessedImageResult): void {
    result.userAction = 'rejected';
    result.selectedMatch = undefined;
    console.log('❌ Rejected match for:', result.imageName);
  }

  reviewMatch(result: ProcessedImageResult): void {
    this.openMatchSelectionDialog(result);
  }

  showAllMatches(result: ProcessedImageResult): void {
    this.openMatchSelectionDialog(result);
  }

  manualAdd(result: ProcessedImageResult): void {
    result.userAction = 'rejected';
    result.selectedMatch = undefined;
    result.status = 'skipped';

    console.log('📝 Manual add requested for:', result.imageName);
    this.applyFilter();
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

    console.log('🔄 Reset user action for:', result.imageName);
    this.applyFilter();
  }

  private openMatchSelectionDialog(result: ProcessedImageResult): void {
    console.log('resulttts', result);
    // Get the original image file for this result
    let originalImage: File | undefined;
    
    if (this.data.originalImages && this.data.originalImages.length > result.imageIndex) {
      originalImage = this.data.originalImages[result.imageIndex];
    }

    // Get file size - try original file first, then stored image data
    let imageSize = 0;
    if (originalImage) {
      imageSize = originalImage.size;
    } else if (this.data.storedImages && this.data.storedImages[result.imageIndex]) {
      // If you have stored image data with size information
      imageSize = this.data.storedImages[result.imageIndex].size || 0;
    }

    const dialogData: ComicMatchDialogData = {
      matches: result.allMatches,
      seriesId: this.data.seriesId,
      sessionId: this.data.sessionId,
      originalImage: originalImage,
      imagePreviewUrl: result.imagePreview,
      imageName: result.imageName,
      imageSize: imageSize
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
        console.log('👆 User manually selected match for:', result.imageName);
      } else if (dialogResult && dialogResult.action === 'no_match') {
        result.userAction = 'rejected';
        result.selectedMatch = undefined;
        result.status = 'no_match';
        console.log('❌ User rejected all matches for:', result.imageName);
      } else if (dialogResult && dialogResult.action === 'cancel') {
        console.log('🚫 User cancelled match selection for:', result.imageName);
      }

      this.applyFilter();
    });
  }

  acceptAll(): void {
    const acceptableResults = this.processedResults.filter(
      (r) => r.bestMatch && r.userAction !== 'accepted' && r.userAction !== 'rejected'
    );

    acceptableResults.forEach((result) => {
      this.acceptMatch(result);
    });

    console.log('✅ Accepted all acceptable matches:', acceptableResults.length);
    this.applyFilter();
  }

  reviewAllMatches(): void {
    this.currentFilter = 'needs_review';
    this.applyFilter();
    console.log('👀 Switched to review view');
  }

  rejectLowConfidence(): void {
    const lowConfidenceResults = this.processedResults.filter(
      (r) => r.confidence === 'low' && r.userAction !== 'rejected'
    );

    lowConfidenceResults.forEach((result) => {
      result.userAction = 'rejected';
      result.selectedMatch = undefined;
    });

    console.log('❌ Rejected low confidence matches:', lowConfidenceResults.length);
    this.applyFilter();
  }

  addAllAccepted(): void {
    const acceptedResults = this.processedResults.filter(
      (r) => r.userAction === 'accepted' || r.userAction === 'manual_select'
    );

    console.log('🎯 Adding accepted results:', acceptedResults.length);

    this.dialogRef.close({
      action: 'bulk_add',
      results: acceptedResults,
      seriesId: this.data.seriesId,
    });
  }

  saveSelections(): void {
    console.log('💾 Saving selections');

    this.dialogRef.close({
      action: 'save',
      results: this.processedResults,
      seriesId: this.data.seriesId,
    });
  }

  onCancel(): void {
    console.log('🚫 Dialog cancelled');
    this.dialogRef.close({ action: 'cancel' });
  }

  getAutoSelectedCount(): number {
    return this.processedResults.filter((r) => r.status === 'auto_selected').length;
  }

  getNeedsReviewCount(): number {
    return this.processedResults.filter((r) => r.status === 'needs_review').length;
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
    return this.processedResults.filter((r) => r.userAction === 'rejected').length;
  }

  getPendingCount(): number {
    return this.processedResults.filter((r) => !r.userAction).length;
  }

  getAcceptableCount(): number {
    return this.processedResults.filter(
      (r) => r.bestMatch && r.userAction !== 'accepted' && r.userAction !== 'rejected'
    ).length;
  }

  getHighConfidenceCount(): number {
    return this.processedResults.filter(
      (r) => r.confidence === 'high' && r.userAction !== 'accepted' && r.userAction !== 'rejected'
    ).length;
  }

  getLowConfidenceCount(): number {
    return this.processedResults.filter(
      (r) => r.confidence === 'low' && r.userAction !== 'rejected'
    ).length;
  }

  // Helper method to count how many rejected items can be restored
  getRestorableRejectedCount(): number {
    return this.processedResults.filter(
      (r) => r.userAction === 'rejected' && r.bestMatch
    ).length;
  }

  hasAcceptedMatches(): boolean {
    return this.getAcceptedCount() > 0;
  }

  hasAnyChanges(): boolean {
    return this.processedResults.some((r) => r.userAction);
  }

  canReviewMatch(result: ProcessedImageResult): boolean {
    return result.allMatches.length > 0;
  }

  canShowAllMatches(result: ProcessedImageResult): boolean {
    return result.allMatches.length > 1;
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

  getStatusIcon(status: string): string {
    switch (status) {
      case 'auto_selected':
        return 'auto_awesome';
      case 'needs_review':
        return 'rate_review';
      case 'no_match':
        return 'block';
      case 'skipped':
        return 'skip_next';
      default:
        return 'help_outline';
    }
  }

  getStatusClass(result: ProcessedImageResult): string {
    return result.status.replace('_', '-');
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
        return 'help_outline';
    }
  }

  getUserActionIcon(userAction: string): string {
    switch (userAction) {
      case 'accepted':
        return 'check_circle';
      case 'rejected':
        return 'cancel';
      case 'manual_select':
        return 'touch_app';
      default:
        return 'help_outline';
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

  getMatchCountText(result: ProcessedImageResult): string {
    const count = result.allMatches.length;
    if (count === 0) return 'No matches found';
    if (count === 1) return '1 potential match';
    return `${count} potential matches`;
  }

  getConfidenceText(similarity: number): string {
    if (similarity >= this.highConfidenceThreshold) return 'High Confidence';
    if (similarity >= this.mediumConfidenceThreshold) return 'Medium Confidence';
    return 'Low Confidence';
  }

  onImageError(event: any): void {
    console.warn('Image failed to load:', event.target.src);
    event.target.src = 'assets/images/no-cover-placeholder.png';
  }

  logCurrentState(): void {
    console.log('=== CURRENT STATE DEBUG ===');
    console.log('Filter:', this.currentFilter);
    console.log('Total results:', this.processedResults.length);
    console.log('Filtered results:', this.filteredResults.length);
    console.log('Auto-selected:', this.getAutoSelectedCount());
    console.log('Needs review:', this.getNeedsReviewCount());
    console.log('No match:', this.getNoMatchCount());
    console.log('Accepted:', this.getAcceptedCount());
    console.log('Rejected:', this.getRejectedCount());
    console.log('Pending:', this.getPendingCount());
    console.log('Results breakdown:',
      this.processedResults.map(r => ({
        name: r.imageName,
        status: r.status,
        confidence: r.confidence,
        userAction: r.userAction,
        hasMatch: !!r.bestMatch,
        similarity: r.bestMatch?.similarity
      }))
    );
    console.log('========================');
  }

  acceptAllHighConfidence(): void {
    const highConfidenceResults = this.processedResults.filter(
      (r) => r.confidence === 'high' && r.userAction !== 'accepted' && r.userAction !== 'rejected'
    );

    highConfidenceResults.forEach((result) => {
      this.acceptMatch(result);
    });

    console.log('✅ Auto-accepted high confidence matches:', highConfidenceResults.length);
    this.applyFilter();
  }

  acceptAllMediumConfidence(): void {
    const mediumConfidenceResults = this.processedResults.filter(
      (r) => r.confidence === 'medium' && r.userAction !== 'accepted' && r.userAction !== 'rejected'
    );

    mediumConfidenceResults.forEach((result) => {
      this.acceptMatch(result);
    });

    console.log('✅ Accepted medium confidence matches:', mediumConfidenceResults.length);
    this.applyFilter();
  }

  rejectAllNoMatch(): void {
    const noMatchResults = this.processedResults.filter(
      (r) => r.status === 'no_match' && r.userAction !== 'rejected'
    );

    noMatchResults.forEach((result) => {
      result.userAction = 'rejected';
      result.selectedMatch = undefined;
    });

    console.log('❌ Rejected all no-match items:', noMatchResults.length);
    this.applyFilter();
  }

  resetAllActions(): void {
    this.processedResults.forEach((result) => {
      this.resetUserAction(result);
    });

    console.log('🔄 Reset all user actions');
    this.applyFilter();
  }

  onKeyDown(event: KeyboardEvent): void {
    // Ctrl/Cmd + A: Accept all
    if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
      event.preventDefault();
      this.acceptAll();
      return;
    }

    // Ctrl/Cmd + R: Review all
    if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
      event.preventDefault();
      this.reviewAllMatches();
      return;
    }

    // Ctrl/Cmd + S: Save
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      if (this.hasAnyChanges()) {
        this.saveSelections();
      }
      return;
    }

    // Enter: Add accepted comics
    if (event.key === 'Enter' && this.hasAcceptedMatches()) {
      event.preventDefault();
      this.addAllAccepted();
      return;
    }

    // Escape: Cancel
    if (event.key === 'Escape') {
      event.preventDefault();
      this.onCancel();
      return;
    }

    // Number keys for filter switching
    switch (event.key) {
      case '1':
        event.preventDefault();
        this.onFilterChange('all');
        break;
      case '2':
        event.preventDefault();
        this.onFilterChange('auto_selected');
        break;
      case '3':
        event.preventDefault();
        this.onFilterChange('needs_review');
        break;
      case '4':
        event.preventDefault();
        this.onFilterChange('rejected');
        break;
      case '5':
        event.preventDefault();
        this.onFilterChange('no_match');
        break;
    }
  }

  private getMatchIdentifier(match: ComicMatch): string {
    return `${match.comic_vine_id || 'unknown'}-${match.comic_name}-${match.issue_number}-${match.url}`;
  }

  exportSelections(): string {
    const exportData = {
      timestamp: new Date().toISOString(),
      seriesId: this.data.seriesId,
      sessionId: this.data.sessionId,
      selections: this.processedResults.map(result => ({
        imageIndex: result.imageIndex,
        imageName: result.imageName,
        userAction: result.userAction,
        selectedMatchIdentifier: result.selectedMatch ? this.getMatchIdentifier(result.selectedMatch) : null,
        status: result.status,
        confidence: result.confidence
      }))
    };

    return JSON.stringify(exportData, null, 2);
  }

  importSelections(jsonData: string): boolean {
    try {
      const importData = JSON.parse(jsonData);

      if (!importData.selections || !Array.isArray(importData.selections)) {
        console.error('Invalid import data format');
        return false;
      }

      // Apply imported selections
      importData.selections.forEach((selection: any) => {
        const result = this.processedResults.find(r => r.imageIndex === selection.imageIndex);
        if (result) {
          result.userAction = selection.userAction;
          if (selection.selectedMatchIdentifier) {
            result.selectedMatch = result.allMatches.find(m =>
              this.getMatchIdentifier(m) === selection.selectedMatchIdentifier
            );
          }
        }
      });

      this.applyFilter();
      console.log('✅ Successfully imported selections');
      return true;
    } catch (error) {
      console.error('Failed to import selections:', error);
      return false;
    }
  }

  getProcessingStats(): any {
    const totalImages = this.processedResults.length;
    const stats = {
      totalImages,
      autoSelected: this.getAutoSelectedCount(),
      needsReview: this.getNeedsReviewCount(),
      noMatch: this.getNoMatchCount(),
      userAccepted: this.getAcceptedCount(),
      userRejected: this.getRejectedCount(),
      pending: this.getPendingCount(),
      averageConfidence: 0,
      highConfidencePercentage: 0,
      mediumConfidencePercentage: 0,
      lowConfidencePercentage: 0,
      processingTime: 0, // Would need to track this
      autoAcceptanceRate: 0
    };

    // Calculate confidence statistics
    const highConf = this.processedResults.filter(r => r.confidence === 'high').length;
    const mediumConf = this.processedResults.filter(r => r.confidence === 'medium').length;
    const lowConf = this.processedResults.filter(r => r.confidence === 'low').length;

    stats.highConfidencePercentage = totalImages > 0 ? (highConf / totalImages) * 100 : 0;
    stats.mediumConfidencePercentage = totalImages > 0 ? (mediumConf / totalImages) * 100 : 0;
    stats.lowConfidencePercentage = totalImages > 0 ? (lowConf / totalImages) * 100 : 0;

    // Calculate average similarity
    const matchResults = this.processedResults.filter(r => r.bestMatch);
    if (matchResults.length > 0) {
      const totalSimilarity = matchResults.reduce((sum, r) => sum + (r.bestMatch?.similarity || 0), 0);
      stats.averageConfidence = totalSimilarity / matchResults.length;
    }

    // Calculate auto-acceptance rate
    stats.autoAcceptanceRate = stats.totalImages > 0 ? (stats.autoSelected / stats.totalImages) * 100 : 0;

    return stats;
  }

  autoReviewAll(): void {
    const needsReviewResults = this.processedResults.filter(
      (r) => r.status === 'needs_review' && !r.userAction
    );

    if (needsReviewResults.length === 0) {
      console.log('No items need review');
      return;
    }

    // Start with the first item
    this.currentReviewIndex = 0;
    this.reviewQueue = needsReviewResults;
    this.openNextReviewDialog();
  }

  private currentReviewIndex = 0;
  private reviewQueue: ProcessedImageResult[] = [];

  private openNextReviewDialog(): void {
    if (this.currentReviewIndex >= this.reviewQueue.length) {
      console.log('✅ Finished reviewing all items');
      this.applyFilter();
      return;
    }
  
    const result = this.reviewQueue[this.currentReviewIndex];
    
    // Get the original image file for this result
    let originalImage: File | undefined;
    if (this.data.originalImages && this.data.originalImages.length > result.imageIndex) {
      originalImage = this.data.originalImages[result.imageIndex];
    }
  
    // Get file size - try original file first, then stored image data
    let imageSize = 0;
    if (originalImage) {
      imageSize = originalImage.size;
    } else if (this.data.storedImages && this.data.storedImages[result.imageIndex]) {
      // If you have stored image data with size information
      imageSize = this.data.storedImages[result.imageIndex].size || 0;
    }
  
    const dialogData: ComicMatchDialogData = {
      matches: result.allMatches,
      seriesId: this.data.seriesId,
      sessionId: this.data.sessionId,
      originalImage: originalImage,
      imagePreviewUrl: result.imagePreview,  // ← This was missing!
      imageName: result.imageName,           // ← This was missing!
      imageSize: imageSize                   // ← This was missing!
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
        console.log(' User manually selected match for:', result.imageName);
      } else if (dialogResult && dialogResult.action === 'no_match') {
        result.userAction = 'rejected';
        result.selectedMatch = undefined;
        result.status = 'no_match';
        console.log('❌ User rejected all matches for:', result.imageName);
      } else if (dialogResult && dialogResult.action === 'cancel') {
        console.log(' User cancelled match selection for:', result.imageName);
      }
  
      // Move to next item
      this.currentReviewIndex++;
      this.openNextReviewDialog();
    });
  }

  restoreRejectedToReview(): void {
    const rejectedResults = this.processedResults.filter(
      (r) => r.userAction === 'rejected' && r.bestMatch
    );

    rejectedResults.forEach((result) => {
      // Clear the user action
      result.userAction = undefined;
      result.selectedMatch = result.bestMatch ?? undefined;

      // Reset status based on original confidence
      if (result.bestMatch) {
        if (result.bestMatch.similarity >= this.highConfidenceThreshold) {
          result.status = 'auto_selected';
        } else {
          result.status = 'needs_review';
        }
      } else {
        result.status = 'no_match';
      }
    });

    console.log('🔄 Restored rejected items to review:', rejectedResults.length);
    this.applyFilter();
  }
}