
import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MaterialModule } from '../../../material.module';
import { ComicMatch } from '../../../models/comic-match.model';

export interface ImageMatcherResponse {
  session_id: string;
  top_matches: ComicMatch[];
  total_matches: number;
  total_covers_processed: number;
  total_urls_processed: number;
  results?: ImageMatcherResponse[];
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
  originalImages?: File[];
  imagePreviewUrl?: string;
  imageName?: string;
  imageSize?: number;
}

@Component({
  selector: 'app-comic-match-selection',
  templateUrl: './comic-match-selection.component.html',
  styleUrls: ['./comic-match-selection.component.scss'],
  imports: [MaterialModule],
})
export class ComicMatchSelectionComponent implements OnInit, OnDestroy {
  sessionId: string = '';
  sortedMatches: ComicMatch[] = [];
  imagePreviewUrls: string[] = [];
  currentImagePreview: string | null = null;

  groupedMatches: { [key: number]: ComicMatch[] } = {};
  imageGroups: {
    index: number;
    name: string;
    matches: ComicMatch[];
    previewUrl: string | null;
  }[] = [];
  selectedImageGroup = 0;
  showAllMatches = true;

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
    this.setCurrentImagePreview();
    
    setTimeout(() => this.scrollToTop(), 0);
  }

  ngOnDestroy(): void {
    // Clean up blob URLs only
    this.imagePreviewUrls.forEach((url) => {
      if (url && url.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(url);
        } catch (error) {
          console.warn('Failed to revoke URL:', url, error);
        }
      }
    });
    this.imagePreviewUrls = [];
  }

  private setCurrentImagePreview(): void {
    if (this.showAllMatches) {
      this.currentImagePreview = this.imagePreviewUrls[0] || null;
    } else {
      const currentGroup = this.imageGroups[this.selectedImageGroup];
      if (currentGroup && currentGroup.previewUrl) {
        this.currentImagePreview = currentGroup.previewUrl;
      } else if (this.selectedImageGroup < this.imagePreviewUrls.length) {
        this.currentImagePreview = this.imagePreviewUrls[this.selectedImageGroup];
      } else {
        this.currentImagePreview = null;
      }
    }

    // Final fallback to match URLs
    if (!this.currentImagePreview && this.sortedMatches.length > 0) {
      this.currentImagePreview = this.sortedMatches[0].local_url || 
                                this.sortedMatches[0].url || 
                                null;
    }
  }

  private setupMatchDisplay(): void {
    this.setupImageGroups();
  }

  private setupImageGroups(): void {
    // Always group matches by source image (defaulting to index 0 for single images)
    this.data.matches.forEach((match) => {
      const sourceIndex = match.sourceImageIndex ?? 0;
      if (!this.groupedMatches[sourceIndex]) {
        this.groupedMatches[sourceIndex] = [];
      }
      this.groupedMatches[sourceIndex].push(match);
    });

    // Sort matches within each group and create image groups
    Object.keys(this.groupedMatches).forEach((indexStr) => {
      const index = parseInt(indexStr);
      this.groupedMatches[index].sort((a, b) => b.similarity - a.similarity);
    });

    // Create image groups for display
    this.imageGroups = Object.keys(this.groupedMatches)
      .map((indexStr) => {
        const index = parseInt(indexStr);
        const matches = this.groupedMatches[index];
        const firstMatch = matches[0];

        return {
          index,
          name: firstMatch?.sourceImageName || this.getDefaultImageName(index),
          matches,
          previewUrl: null,
        };
      })
      .sort((a, b) => a.index - b.index);

    this.updateDisplayedMatches();
    this.totalImagesProcessed = this.imageGroups.length;
    this.totalMatchesFound = this.data.matches.length;
  }

  private getDefaultImageName(index: number): string {
    // For single images, try to get name from data first
    if (this.imageGroups.length === 1) {
      if (this.data.imageName) {
        return this.data.imageName;
      }
      if (this.data.originalImage?.name) {
        return this.data.originalImage.name;
      }
    }
    return `Image ${index + 1}`;
  }

  private updateDisplayedMatches(): void {
    if (this.showAllMatches) {
      this.sortedMatches = [...this.data.matches].sort(
        (a, b) => b.similarity - a.similarity
      );
    } else if (this.selectedImageGroup < this.imageGroups.length) {
      this.sortedMatches = [
        ...this.imageGroups[this.selectedImageGroup].matches,
      ];
    }
  }

  private createImagePreviews(): void {
    if (this.data.imagePreviewUrl) {
      this.imagePreviewUrls = [this.data.imagePreviewUrl];
      return;
    }

    if (this.data.originalImages && this.data.originalImages.length > 0) {
      this.imagePreviewUrls = this.data.originalImages
        .map((file) => {
          try {
            if (file && file instanceof File) {
              return URL.createObjectURL(file);
            }
            return null;
          } catch (error) {
            console.warn('Failed to create preview for file:', file?.name || 'unknown');
            return null;
          }
        })
        .filter((url) => url !== null) as string[];

      // Assign preview URLs to image groups
      this.imageGroups.forEach((group) => {
        if (group.index < this.imagePreviewUrls.length) {
          group.previewUrl = this.imagePreviewUrls[group.index];
        }
      });
    } 
    else if (this.data.originalImage) {
      try {
        if (this.data.originalImage instanceof File) {
          const url = URL.createObjectURL(this.data.originalImage);
          this.imagePreviewUrls = [url];
        } else {
          this.imagePreviewUrls = [];
        }
      } catch (error) {
        console.warn('Failed to create preview for single file:', error);
        this.imagePreviewUrls = [];
      }
    } 
    else {
      const localUrls = this.data.matches
        .map(match => match.local_url)
        .filter((url): url is string => !!url)
        .slice(0, 5);
      
      this.imagePreviewUrls = localUrls;
    }

    // Ensure single images get their preview URL assigned to the group
    if (this.imageGroups.length === 1 && this.imagePreviewUrls.length > 0) {
      this.imageGroups[0].previewUrl = this.imagePreviewUrls[0];
    }
  }

  getBestMatchPercentage(): number {
    return this.sortedMatches.length > 0
      ? Math.round(this.sortedMatches[0].similarity * 100)
      : 0;
  }

  getFeaturePercent(feature: any): number {
    return feature.total_matches > 0
      ? (feature.good_matches / feature.total_matches) * 100
      : 0;
  }

  getConfidenceText(similarity: number): string {
    if (similarity >= 0.25) return 'High Confidence';
    if (similarity >= 0.15) return 'Medium Confidence';
    return 'Low Confidence';
  }

  selectImageGroup(index: number): void {
    this.selectedImageGroup = index;
    this.showAllMatches = false;
    this.updateDisplayedMatches();
    this.setCurrentImagePreview();
  }

  showAllMatchesView(): void {
    this.showAllMatches = true;
    this.updateDisplayedMatches();
    this.setCurrentImagePreview();
  }

  get hasMultipleImages(): boolean {
    return this.imageGroups.length > 1;
  }

  selectMatch(match: ComicMatch): void {
    this.dialogRef.close({
      action: 'select',
      match,
      seriesId: this.data.seriesId,
      sourceImageIndex: match.sourceImageIndex,
      sourceImageName: match.sourceImageName,
    });
  }

  onCancel(): void {
    this.dialogRef.close({ action: 'cancel' });
  }

  onReject(): void {
    this.dialogRef.close({
      action: 'rejected',
      seriesId: this.data.seriesId,
      sourceImageIndex:
        this.hasMultipleImages && !this.showAllMatches
          ? this.selectedImageGroup
          : undefined,
    });
  }

  private scrollToTop(): void {
    const content = document.querySelector('.content');
    if (content) content.scrollTop = 0;
  }

  getDisplayFileName(): string {
    if (this.hasMultipleImages) {
      if (this.showAllMatches) {
        return `${this.totalImagesProcessed} images processed`;
      } else {
        const currentGroup = this.imageGroups[this.selectedImageGroup];
        if (currentGroup) {
          return currentGroup.name || `Image ${this.selectedImageGroup + 1}`;
        }
        return `Image ${this.selectedImageGroup + 1}`;
      }
    }
    
    // Single image mode - get name from first group
    if (this.imageGroups.length === 1) {
      return this.imageGroups[0].name;
    }
    
    return 'Unknown Image';
  }

  onImageError(event: any): void {
    const img = event.target;
    
    // If it's the original image and we have alternatives
    if (img.classList.contains('original-image')) {
      const alternativePreview = this.imagePreviewUrls.find(url => url !== img.src);
      if (alternativePreview) {
        img.src = alternativePreview;
        return;
      }
      
      if (this.sortedMatches.length > 0 && this.sortedMatches[0].local_url) {
        img.src = this.sortedMatches[0].local_url;
        return;
      }
    }
    
    // Default fallback
    img.src = 'assets/images/no-cover-placeholder.png';
  }

  getSourceImageIndicator(match: ComicMatch): string {
    if (!this.hasMultipleImages || !this.showAllMatches) {
      return '';
    }

    const sourceIndex = match.sourceImageIndex;
    const sourceName = match.sourceImageName;

    if (sourceIndex !== undefined) {
      if (sourceName) {
        const truncatedName =
          sourceName.length > 20
            ? sourceName.substring(0, 17) + '...'
            : sourceName;
        return `From: ${truncatedName}`;
      }
      return `From Image ${sourceIndex + 1}`;
    }

    return '';
  }

  getHeaderTitle(): string {
    if (this.hasMultipleImages) {
      if (this.showAllMatches) {
        return 'All Comic Matches';
      } else {
        const currentGroup = this.imageGroups[this.selectedImageGroup];
        return currentGroup
          ? `Matches for ${currentGroup.name}`
          : 'Comic Matches';
      }
    }
    return 'Comic Match Results';
  }

  getHeaderSubtitle(): string {
    if (this.hasMultipleImages) {
      if (this.showAllMatches) {
        return `${this.totalMatchesFound} matches from ${this.totalImagesProcessed} images`;
      } else {
        return `Image ${this.selectedImageGroup + 1} of ${
          this.totalImagesProcessed
        } • ${this.sortedMatches.length} matches`;
      }
    }

    if (this.data.sessionId) {
      return `Session: ${this.data.sessionId} • ${this.sortedMatches.length} matches found`;
    }

    return `${this.sortedMatches.length} matches found`;
  }
}