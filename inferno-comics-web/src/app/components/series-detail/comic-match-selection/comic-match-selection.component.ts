import { CommonModule } from "@angular/common";
import { Component, Inject, OnInit, OnDestroy } from "@angular/core";
import { MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MaterialModule } from "../../../material.module";
import { Issue } from "../../../models/issue.model";

export interface ComicMatch {
  session_id: string;
  url: string;
  similarity: number;
  status: string;
  match_details: {
    orb: { good_matches: number; similarity: number; total_matches: number; };
    sift: { good_matches: number; similarity: number; total_matches: number; };
    akaze: { good_matches: number; similarity: number; total_matches: number; };
    kaze: { good_matches: number; similarity: number; total_matches: number; };
  };
  candidate_features: { orb_count: number; sift_count: number; };
  comic_name: string;
  issue_number: string;
  comic_vine_id: number | null;
  cover_error: string;
  issue: Issue | null;
  parent_comic_vine_id: number | null;
  // Multiple images specific properties
  sourceImageIndex?: number;
  sourceImageName?: string;
}

export interface ImageMatcherResponse {
  session_id: string;
  top_matches: ComicMatch[];
  total_matches: number;
  total_covers_processed: number;
  total_urls_processed: number;
  // Multiple images response format
  results?: ImageMatcherResponse[]; // Array of individual image results
  summary?: {
    total_images_processed: number;
    successful_images: number;
    failed_images: number;
    total_matches_all_images: number;
  };
}

export interface ComicMatchDialogData {
  matches: ComicMatch[];
  seriesId: number;
  sessionId?: string;
  originalImage?: File;
  originalImages?: File[]; // Multiple images support
  isMultiple?: boolean; // Flag for multiple images mode
}

@Component({
  selector: 'app-comic-match-selection',
  templateUrl: './comic-match-selection.component.html',
  styleUrls: ['./comic-match-selection.component.scss'],
  imports: [CommonModule, MaterialModule],
})
export class ComicMatchSelectionComponent implements OnInit, OnDestroy {
  sessionId: string = '';
  sortedMatches: ComicMatch[] = [];
  private imagePreviewUrls: string[] = [];
  
  // Multiple images properties
  isMultipleMode = false;
  groupedMatches: { [key: number]: ComicMatch[] } = {};
  imageGroups: { index: number; name: string; matches: ComicMatch[]; previewUrl: string | null }[] = [];
  selectedImageGroup = 0;
  showAllMatches = true;
  
  // Statistics
  totalImagesProcessed = 0;
  totalMatchesFound = 0;

  constructor(
    public dialogRef: MatDialogRef<ComicMatchSelectionComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ComicMatchDialogData
  ) {
    this.sessionId = data.sessionId || 'Unknown';
  }

  ngOnInit(): void {
    this.setupMatchDisplay();
    this.createImagePreviews();
    
    // Scroll to top
    setTimeout(() => this.scrollToTop(), 0);
  }

  ngOnDestroy(): void {
    // Clean up all image preview URLs
    this.imagePreviewUrls.forEach(url => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    });
  }

  private setupMatchDisplay(): void {
    this.isMultipleMode = this.data.isMultiple || this.hasMultipleSourceImages();
    
    if (this.isMultipleMode) {
      this.setupMultipleImagesDisplay();
    } else {
      this.setupSingleImageDisplay();
    }
  }

  private hasMultipleSourceImages(): boolean {
    // Check if matches have different sourceImageIndex values
    const sourceIndices = new Set(this.data.matches.map(m => m.sourceImageIndex).filter(i => i !== undefined));
    return sourceIndices.size > 1;
  }

  private setupSingleImageDisplay(): void {
    this.sortedMatches = [...this.data.matches].sort((a, b) => b.similarity - a.similarity);
    this.totalMatchesFound = this.sortedMatches.length;
  }

  private setupMultipleImagesDisplay(): void {
    // Group matches by source image
    this.data.matches.forEach(match => {
      const sourceIndex = match.sourceImageIndex ?? 0;
      if (!this.groupedMatches[sourceIndex]) {
        this.groupedMatches[sourceIndex] = [];
      }
      this.groupedMatches[sourceIndex].push(match);
    });

    // Sort matches within each group and create image groups
    Object.keys(this.groupedMatches).forEach(indexStr => {
      const index = parseInt(indexStr);
      this.groupedMatches[index].sort((a, b) => b.similarity - a.similarity);
    });

    // Create image groups for display
    this.imageGroups = Object.keys(this.groupedMatches).map(indexStr => {
      const index = parseInt(indexStr);
      const matches = this.groupedMatches[index];
      const firstMatch = matches[0];
      
      return {
        index,
        name: firstMatch?.sourceImageName || `Image ${index + 1}`,
        matches,
        previewUrl: null // Will be set in createImagePreviews
      };
    }).sort((a, b) => a.index - b.index);

    // Set up initial display (show all matches or first group)
    this.updateDisplayedMatches();
    
    this.totalImagesProcessed = this.imageGroups.length;
    this.totalMatchesFound = this.data.matches.length;
  }

  private createImagePreviews(): void {
    if (this.isMultipleMode && this.data.originalImages) {
      // Create previews for all images
      this.imagePreviewUrls = this.data.originalImages.map(file => URL.createObjectURL(file));
      
      // Assign preview URLs to image groups
      this.imageGroups.forEach(group => {
        if (group.index < this.imagePreviewUrls.length) {
          group.previewUrl = this.imagePreviewUrls[group.index];
        }
      });
    } else if (this.data.originalImage) {
      // Single image preview
      this.imagePreviewUrls = [URL.createObjectURL(this.data.originalImage)];
    }
  }

  private updateDisplayedMatches(): void {
    if (this.showAllMatches) {
      // Show all matches sorted by similarity
      this.sortedMatches = [...this.data.matches].sort((a, b) => b.similarity - a.similarity);
    } else if (this.selectedImageGroup < this.imageGroups.length) {
      // Show matches for selected image group
      this.sortedMatches = [...this.imageGroups[this.selectedImageGroup].matches];
    }
  }

  // UI Helper Methods
  getImagePreview(): string | null {
    return this.imagePreviewUrls[0] || null;
  }

  getCurrentImagePreview(): string | null {
    if (this.isMultipleMode && this.imageGroups.length > 0) {
      const currentGroup = this.imageGroups[this.selectedImageGroup];
      return currentGroup?.previewUrl || null;
    }
    return this.getImagePreview();
  }

  getDisplayFileName(): string {
    if (this.isMultipleMode) {
      if (this.showAllMatches) {
        return `${this.totalImagesProcessed} images`;
      } else {
        const currentGroup = this.imageGroups[this.selectedImageGroup];
        return currentGroup?.name || 'Unknown';
      }
    }
    return this.data.originalImage?.name || 'Unknown';
  }

  getDisplayFileSize(): number {
    if (this.isMultipleMode && this.data.originalImages) {
      if (this.showAllMatches) {
        return this.data.originalImages.reduce((total, file) => total + file.size, 0);
      } else {
        const currentGroup = this.imageGroups[this.selectedImageGroup];
        if (currentGroup && currentGroup.index < this.data.originalImages.length) {
          return this.data.originalImages[currentGroup.index].size;
        }
      }
    }
    return this.data.originalImage?.size || 0;
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getBestMatchPercentage(): number {
    return this.sortedMatches.length > 0 ? Math.round(this.sortedMatches[0].similarity * 100) : 0;
  }

  getFeaturePercent(feature: any): number {
    return feature.total_matches > 0 ? (feature.good_matches / feature.total_matches) * 100 : 0;
  }

  getConfidenceText(similarity: number): string {
    if (similarity >= 0.25) return 'High Confidence';
    if (similarity >= 0.15) return 'Medium Confidence';
    return 'Low Confidence';
  }

  // Multiple Images Specific Methods
  selectImageGroup(index: number): void {
    this.selectedImageGroup = index;
    this.showAllMatches = false;
    this.updateDisplayedMatches();
  }

  showAllMatchesView(): void {
    this.showAllMatches = true;
    this.updateDisplayedMatches();
  }

  getImageGroupStats(group: any): string {
    const bestMatch = group.matches[0];
    const matchCount = group.matches.length;
    const bestPercentage = bestMatch ? Math.round(bestMatch.similarity * 100) : 0;
    return `${matchCount} matches, best: ${bestPercentage}%`;
  }

  getSourceImageIndicator(match: ComicMatch): string {
    if (!this.isMultipleMode || this.showAllMatches) {
      const sourceIndex = match.sourceImageIndex;
      const sourceName = match.sourceImageName;
      if (sourceIndex !== undefined) {
        return sourceName ? `From: ${sourceName}` : `From Image ${sourceIndex + 1}`;
      }
    }
    return '';
  }

  // Action Methods
  selectMatch(match: ComicMatch): void {
    this.dialogRef.close({ 
      action: 'select', 
      match, 
      seriesId: this.data.seriesId,
      sourceImageIndex: match.sourceImageIndex,
      sourceImageName: match.sourceImageName
    });
  }

  onCancel(): void {
    this.dialogRef.close({ action: 'cancel' });
  }

  onNoMatch(): void {
    this.dialogRef.close({ 
      action: 'no_match', 
      seriesId: this.data.seriesId,
      sourceImageIndex: this.isMultipleMode && !this.showAllMatches ? this.selectedImageGroup : undefined
    });
  }

  onImageError(event: any): void {
    event.target.src = 'assets/images/no-cover-placeholder.png';
  }

  private scrollToTop(): void {
    const content = document.querySelector('.content');
    if (content) content.scrollTop = 0;
  }

  // Utility methods for template
  getHeaderTitle(): string {
    if (this.isMultipleMode) {
      return this.showAllMatches ? 'All Comic Matches' : `Matches for ${this.getDisplayFileName()}`;
    }
    return 'Comic Match Results';
  }

  getHeaderSubtitle(): string {
    if (this.isMultipleMode) {
      return this.showAllMatches 
        ? `${this.totalMatchesFound} matches from ${this.totalImagesProcessed} images`
        : `Image ${this.selectedImageGroup + 1} of ${this.totalImagesProcessed}`;
    }
    return `Session: ${this.sessionId}`;
  }
}