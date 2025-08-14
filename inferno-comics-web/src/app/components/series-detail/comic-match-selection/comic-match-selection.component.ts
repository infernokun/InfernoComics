import { CommonModule } from '@angular/common';
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
  isMultiple?: boolean;
  // New properties for fallback image display
  imagePreviewUrl?: string;
  imageName?: string;
  imageSize?: number;
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
  imagePreviewUrls: string[] = []; // Made public for template access

  // Multiple images properties
  isMultipleMode = false;
  groupedMatches: { [key: number]: ComicMatch[] } = {};
  imageGroups: {
    index: number;
    name: string;
    matches: ComicMatch[];
    previewUrl: string | null;
  }[] = [];
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
    this.validateDialogData();
    this.setupMatchDisplay();
    this.createImagePreviews();
    
    // Debug logging
    console.log('Comic Match Component Initialized:', {
      isMultipleMode: this.isMultipleMode,
      imageGroupsCount: this.imageGroups.length,
      imagePreviewUrlsCount: this.imagePreviewUrls.length,
      sortedMatchesCount: this.sortedMatches.length
    });
    
    // Scroll to top
    setTimeout(() => this.scrollToTop(), 0);
  }

  // Enhanced cleanup
  ngOnDestroy(): void {
    // Clean up all image preview URLs (only blob URLs)
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

  private setupMatchDisplay(): void {
    this.isMultipleMode =
      this.data.isMultiple || this.hasMultipleSourceImages();

    if (this.isMultipleMode) {
      this.setupMultipleImagesDisplay();
    } else {
      this.setupSingleImageDisplay();
    }
  }

  private hasMultipleSourceImages(): boolean {
    // Check if matches have different sourceImageIndex values
    const sourceIndices = new Set(
      this.data.matches
        .map((m) => m.sourceImageIndex)
        .filter((i) => i !== undefined)
    );
    return sourceIndices.size > 1;
  }

  private setupSingleImageDisplay(): void {
    this.sortedMatches = [...this.data.matches].sort(
      (a, b) => b.similarity - a.similarity
    );
    this.totalMatchesFound = this.sortedMatches.length;
  }

  private setupMultipleImagesDisplay(): void {
    // Group matches by source image
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
          name: firstMatch?.sourceImageName || `Image ${index + 1}`,
          matches,
          previewUrl: null,
        };
      })
      .sort((a, b) => a.index - b.index);

    // Set up initial display (show all matches or first group)
    this.updateDisplayedMatches();

    this.totalImagesProcessed = this.imageGroups.length;
    this.totalMatchesFound = this.data.matches.length;
  }

  private updateDisplayedMatches(): void {
    if (this.showAllMatches) {
      // Show all matches sorted by similarity
      this.sortedMatches = [...this.data.matches].sort(
        (a, b) => b.similarity - a.similarity
      );
    } else if (this.selectedImageGroup < this.imageGroups.length) {
      // Show matches for selected image group
      this.sortedMatches = [
        ...this.imageGroups[this.selectedImageGroup].matches,
      ];
    }
  }

  // Enhanced method to create image previews with fallback support
  private createImagePreviews(): void {
    console.log('🖼️ Creating image previews...', {
      isMultipleMode: this.isMultipleMode,
      hasOriginalImage: !!this.data.originalImage,
      hasOriginalImages: !!(this.data.originalImages && this.data.originalImages.length > 0),
      hasImagePreviewUrl: !!this.data.imagePreviewUrl,
      originalImagesCount: this.data.originalImages?.length || 0
    });

    // First priority: Use provided preview URL (from bulk component)
    if (this.data.imagePreviewUrl) {
      console.log('✅ Using provided preview URL:', this.data.imagePreviewUrl);
      this.imagePreviewUrls = [this.data.imagePreviewUrl];
      return;
    }

    if (this.isMultipleMode && this.data.originalImages) {
      // Create previews for all images
      console.log('📸 Processing multiple images...');
      this.imagePreviewUrls = this.data.originalImages
        .map((file, index) => {
          try {
            if (file && file instanceof File) {
              const url = URL.createObjectURL(file);
              console.log(`✅ Created preview for image ${index}:`, file.name, url);
              return url;
            } else {
              console.warn(`❌ Invalid file at index ${index}:`, file);
              return null;
            }
          } catch (error) {
            console.warn(
              'Failed to create preview for file:',
              file?.name || 'unknown',
              error
            );
            return null;
          }
        })
        .filter((url) => url !== null) as string[];

      // Assign preview URLs to image groups
      this.imageGroups.forEach((group) => {
        if (group.index < this.imagePreviewUrls.length) {
          group.previewUrl = this.imagePreviewUrls[group.index];
          console.log(`🔗 Assigned preview to group ${group.index}:`, group.previewUrl);
        } else {
          console.warn(`⚠️ No preview URL for group ${group.index}`);
        }
      });
    } else if (this.data.originalImage) {
      // Single image preview
      console.log('📷 Processing single image...');
      try {
        if (this.data.originalImage instanceof File) {
          const url = URL.createObjectURL(this.data.originalImage);
          this.imagePreviewUrls = [url];
          console.log('✅ Created single image preview:', this.data.originalImage.name, url);
        } else {
          console.warn('❌ Original image is not a File object:', this.data.originalImage);
          this.imagePreviewUrls = [];
        }
      } catch (error) {
        console.warn('Failed to create preview for single file:', error);
        this.imagePreviewUrls = [];
      }
    } else {
      // No original images available - try to get from matches
      console.warn(
        '⚠️ No original images provided, trying to use match local_url'
      );
      this.imagePreviewUrls = [];
      
      // Try to extract local URLs from matches as fallback
      const localUrls = this.data.matches
        .map(match => match.local_url)
        .filter((url): url is string => !!url) // Type guard to filter out undefined
        .slice(0, 5); // Limit to prevent too many URLs
      
      if (localUrls.length > 0) {
        console.log('📎 Found local URLs as fallback:', localUrls);
        this.imagePreviewUrls = localUrls;
      }
    }

    console.log('🎯 Final image preview URLs:', this.imagePreviewUrls);
  }

  // Enhanced method to get current image preview
  getCurrentImagePreview(): string | null {
    console.log('🔍 Getting current image preview...', {
      isMultipleMode: this.isMultipleMode,
      showAllMatches: this.showAllMatches,
      selectedImageGroup: this.selectedImageGroup,
      imagePreviewUrlsLength: this.imagePreviewUrls.length,
      imageGroupsLength: this.imageGroups.length
    });

    if (this.isMultipleMode) {
      if (this.showAllMatches) {
        // When showing all matches, show first available preview
        const preview = this.imagePreviewUrls[0] || null;
        console.log('📋 All matches mode - using first preview:', preview);
        return preview;
      } else {
        // Show preview for selected image group
        const currentGroup = this.imageGroups[this.selectedImageGroup];
        console.log('🎯 Selected group mode - current group:', currentGroup);
        
        if (currentGroup && currentGroup.previewUrl) {
          console.log('✅ Found preview in current group:', currentGroup.previewUrl);
          return currentGroup.previewUrl;
        }
        
        // Fallback to index-based preview
        if (this.selectedImageGroup < this.imagePreviewUrls.length) {
          const fallbackPreview = this.imagePreviewUrls[this.selectedImageGroup];
          console.log('🔄 Using index-based fallback:', fallbackPreview);
          return fallbackPreview;
        }
      }
    } else {
      // Single image mode
      const singlePreview = this.imagePreviewUrls[0] || null;
      console.log('🖼️ Single image mode - preview:', singlePreview);
      return singlePreview;
    }

    // Final fallback - try to get from first match's local_url or url
    if (this.sortedMatches.length > 0) {
      const matchFallback = this.sortedMatches[0].local_url || this.sortedMatches[0].url || null;
      console.log('🆘 Using match fallback:', matchFallback);
      return matchFallback;
    }

    console.log('❌ No preview found');
    return null;
  }

  // UI Helper Methods
  getImagePreview(): string | null {
    return this.imagePreviewUrls[0] || null;
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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

  // Action Methods
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

  onNoMatch(): void {
    this.dialogRef.close({
      action: 'no_match',
      seriesId: this.data.seriesId,
      sourceImageIndex:
        this.isMultipleMode && !this.showAllMatches
          ? this.selectedImageGroup
          : undefined,
    });
  }

  private scrollToTop(): void {
    const content = document.querySelector('.content');
    if (content) content.scrollTop = 0;
  }

  // Enhanced display file name with fallback support
  getDisplayFileName(): string {
    if (this.isMultipleMode) {
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
    
    // Single image mode - try fallback data first
    if (this.data.imageName) {
      return this.data.imageName;
    }
    
    // Then try original image name
    if (this.data.originalImage?.name) {
      return this.data.originalImage.name;
    }
    
    // Fallback to match source name
    if (this.sortedMatches.length > 0 && this.sortedMatches[0].sourceImageName) {
      return this.sortedMatches[0].sourceImageName;
    }
    
    return 'Unknown Image';
  }

  // Enhanced error handling for images
  onImageError(event: any): void {
    console.warn('Image failed to load:', event.target.src);
    // Try different fallback approaches
    const img = event.target;
    
    // If it's the original image and we have alternatives
    if (img.classList.contains('original-image')) {
      // Try to find an alternative preview
      const alternativePreview = this.imagePreviewUrls.find(url => url !== img.src);
      if (alternativePreview) {
        img.src = alternativePreview;
        return;
      }
      
      // Try to use the first match's local_url
      if (this.sortedMatches.length > 0 && this.sortedMatches[0].local_url) {
        img.src = this.sortedMatches[0].local_url;
        return;
      }
    }
    
    // Default fallback
    img.src = 'assets/images/no-cover-placeholder.png';
  }

  // Method to handle dialog data validation
  private validateDialogData(): void {
    // Log what we received for debugging
    console.log('Comic Match Dialog Data:', {
      hasOriginalImage: !!this.data.originalImage,
      hasOriginalImages: !!(this.data.originalImages && this.data.originalImages.length > 0),
      hasImagePreviewUrl: !!this.data.imagePreviewUrl,
      hasImageName: !!this.data.imageName,
      hasImageSize: !!this.data.imageSize,
      matchesCount: this.data.matches.length,
      isMultiple: this.data.isMultiple,
      sessionId: this.data.sessionId
    });

    // Warn if no original images are provided
    if (!this.data.originalImage && 
        (!this.data.originalImages || this.data.originalImages.length === 0) &&
        !this.data.imagePreviewUrl) {
      console.warn('No original images or preview URL provided to ComicMatchSelectionComponent');
    }
  }

  // Method to get fallback image sources
  private getFallbackImageSources(match?: ComicMatch): string[] {
    const sources: string[] = [];

    if (match) {
      if (match.local_url) sources.push(match.local_url);
      if (match.url) sources.push(match.url);
    }

    // Add any available preview URLs
    sources.push(...this.imagePreviewUrls.filter((url) => url));

    // Final fallback
    sources.push('assets/images/no-cover-placeholder.png');

    return sources;
  }

  // Enhanced source image indicator
  getSourceImageIndicator(match: ComicMatch): string {
    if (!this.isMultipleMode || !this.showAllMatches) {
      return '';
    }

    const sourceIndex = match.sourceImageIndex;
    const sourceName = match.sourceImageName;

    if (sourceIndex !== undefined) {
      if (sourceName) {
        // Truncate long names
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

  // Enhanced method to get image group stats
  getImageGroupStats(group: any): string {
    const matchCount = group.matches.length;
    if (matchCount === 0) return 'No matches';

    const bestMatch = group.matches[0];
    const bestPercentage = bestMatch
      ? Math.round(bestMatch.similarity * 100)
      : 0;

    if (matchCount === 1) {
      return `1 match (${bestPercentage}%)`;
    }

    return `${matchCount} matches (best: ${bestPercentage}%)`;
  }

  // Method to check if we have valid original image data
  hasValidOriginalImage(): boolean {
    if (this.isMultipleMode) {
      return (
        this.imageGroups.length > 0 &&
        this.imageGroups.some((group) => group.previewUrl)
      );
    }
    return this.imagePreviewUrls.length > 0 && this.imagePreviewUrls[0] != null;
  }

  // Enhanced header methods for better display
  getHeaderTitle(): string {
    if (this.isMultipleMode) {
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
    if (this.isMultipleMode) {
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