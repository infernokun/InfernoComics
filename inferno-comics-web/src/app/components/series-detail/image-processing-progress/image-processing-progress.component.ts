import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../material.module';

export interface ImageProcessingData {
  file?: File;
  files?: File[];
  seriesId: number;
  isMultiple?: boolean;
  onProgress?: (stage: string, progress: number) => void;
  onComplete?: (result: any) => void;
  onError?: (error: any) => void;
}

@Component({
  selector: 'app-image-processing-dialog',
  templateUrl: 'image-processing-progress.component.html',
  styleUrls: ['image-processing-progress.component.scss'],
  imports: [CommonModule, MaterialModule],
})
export class ImageProcessingDialogComponent implements OnInit, OnDestroy {
  imagePreviews: string[] = [];
  progress = 0;
  currentStage = 'Preparing...';
  currentStageIndex = 0;
  isProcessing = true;
  hasError = false;
  errorMessage = '';
  canRetry = false;
  startTime = new Date();

  // Multiple images specific properties
  isMultipleMode = false;
  totalImages = 0;
  currentImageIndex = 0;
  currentImageName = '';
  processedImages = 0;
  successfulImages = 0;
  failedImages = 0;

  // Enhanced thumbnail tracking
  thumbnailStates: Array<'pending' | 'processing' | 'completed' | 'failed'> = [];
  
  // Status feed scroll tracking
  private hasUnreadMessages = false;
  private messagesContainer: HTMLElement | null = null;
  
  // Processing result storage
  processingResult: any = null;

  // Progress tracking
  private lastUpdateTime = 0;
  private lastProgressValue = 0;
  private lastStage = '';
  private readonly UPDATE_DEBOUNCE_MS = 100;
  private hasReceivedRealProgress = false;

  // Stage mapping for better progress tracking
  private stageMapping: { [key: string]: number } = {
    processing_data: 0,
    preparing: 0,
    initializing_matcher: 1,
    extracting_features: 1,
    comparing_images: 2,
    processing_results: 3,
    finalizing: 4,
    complete: 4,
  };

  processingStages = [
    { name: 'Processing data', key: 'processing_data' },
    { name: 'Extracting features', key: 'extracting_features' },
    { name: 'Comparing images', key: 'comparing_images' },
    { name: 'Processing results', key: 'processing_results' },
    { name: 'Finalizing', key: 'finalizing' },
  ];

  statusMessages: Array<{
    text: string;
    type: 'info' | 'success' | 'warning' | 'error';
    timestamp: Date;
  }> = [];

  Math = Math;

  constructor(
    public dialogRef: MatDialogRef<ImageProcessingDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ImageProcessingData
  ) {}

  ngOnInit() {
    this.setupImageProcessing();
    this.createImagePreviews();
    this.initializeThumbnailStates();
    this.addInitialStatusMessage();

    console.log('ImageProcessingDialog initialized - waiting for real progress updates');
    setTimeout(() => this.scrollToTop(), 0);
  }

  ngOnDestroy() {
    this.imagePreviews.forEach((preview) => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    });
  }

  private setupImageProcessing() {
    this.isMultipleMode = this.data.isMultiple || (this.data.files! && this.data.files.length > 1);

    if (this.isMultipleMode && this.data.files) {
      this.totalImages = this.data.files.length;
      this.currentImageIndex = 0;
      this.currentImageName = this.data.files[0]?.name || '';
    } else {
      this.totalImages = 1;
      this.currentImageName = this.data.file?.name || '';
    }
    this.processedImages = 0;
  }

  private createImagePreviews() {
    if (this.isMultipleMode && this.data.files) {
      this.imagePreviews = this.data.files.map((file) => URL.createObjectURL(file));
    } else if (this.data.file) {
      this.imagePreviews = [URL.createObjectURL(this.data.file)];
    }
  }

  private initializeThumbnailStates() {
    // Initialize all thumbnails as pending except the first one
    this.thumbnailStates = Array(this.totalImages).fill('pending');
    if (this.totalImages > 0) {
      this.thumbnailStates[0] = 'processing'; // First image starts processing
    }
  }

  private addInitialStatusMessage() {
    if (this.isMultipleMode) {
      this.addStatusMessage(`Starting analysis of ${this.totalImages} images...`, 'info');
    } else {
      this.addStatusMessage('Starting image analysis...', 'info');
    }
  }

  updateProgress(stage: string, progressPercent: number, message?: string) {
    this.hasReceivedRealProgress = true;
    const now = Date.now();

    // Smart debouncing
    const isImportantUpdate = stage !== this.lastStage ||
      progressPercent >= 100 ||
      stage === 'complete' ||
      Math.abs(progressPercent - this.lastProgressValue) >= 5 ||
      now - this.lastUpdateTime > 1000;

    if (!isImportantUpdate && now - this.lastUpdateTime < this.UPDATE_DEBOUNCE_MS) {
      return;
    }

    // Ensure progress only moves forward
    const newProgress = Math.min(100, Math.max(this.progress, progressPercent));

    if (newProgress >= this.progress || stage !== this.currentStage) {
      this.lastUpdateTime = now;
      this.lastProgressValue = newProgress;
      this.lastStage = stage;
      this.progress = newProgress;
      this.currentStage = stage;

      // Update stage index
      const mappedIndex = this.stageMapping[stage];
      if (mappedIndex !== undefined) {
        this.currentStageIndex = Math.max(this.currentStageIndex, mappedIndex);
      }

      // Enhanced multi-image progress parsing
      if (message && this.isMultipleMode) {
        this.parseImageProgressEnhanced(message);
      }

      if (message) {
        this.addStatusMessage(message, 'info');
      }

      console.log(`Progress update: ${stage} ${newProgress}% - ${message || ''}`);
    }
  }

  private parseImageProgressEnhanced(message: string) {
    console.log('Parsing multi-image progress:', message);

    const imageMatch = message.match(/(?:image|Image)\s+(\d+)(?:\/(\d+))?/i);
    if (imageMatch) {
      const currentImageNum = parseInt(imageMatch[1]);
      const newImageIndex = Math.max(0, Math.min(currentImageNum - 1, this.totalImages - 1));

      // Check if we're moving to a new image
      if (newImageIndex !== this.currentImageIndex) {
        // Mark previous image as completed
        if (this.currentImageIndex < this.thumbnailStates.length) {
          this.thumbnailStates[this.currentImageIndex] = 'completed';
        }
        
        // Update to new image
        this.currentImageIndex = newImageIndex;
        if (newImageIndex < this.thumbnailStates.length) {
          this.thumbnailStates[newImageIndex] = 'processing';
        }
        
        console.log(`✨ Moved to image ${currentImageNum}, marked previous as completed`);
      }

      // Handle completion messages
      if (message.includes('Completed') || message.includes('matches found') || message.includes('Analysis complete')) {
        this.processedImages = Math.max(this.processedImages, currentImageNum);
        this.successfulImages = Math.max(this.successfulImages, currentImageNum);
        
        // Mark current image as completed
        if (this.currentImageIndex < this.thumbnailStates.length) {
          this.thumbnailStates[this.currentImageIndex] = 'completed';
        }
        
        // Start processing next image if available
        const nextIndex = this.currentImageIndex + 1;
        if (nextIndex < this.totalImages && nextIndex < this.thumbnailStates.length) {
          this.thumbnailStates[nextIndex] = 'processing';
          this.currentImageIndex = nextIndex;
        }
        
        console.log(`✅ Image ${currentImageNum} completed. Moving to next...`);
      } else if (message.includes('Failed') || message.includes('error')) {
        this.failedImages++;
        if (this.currentImageIndex < this.thumbnailStates.length) {
          this.thumbnailStates[this.currentImageIndex] = 'failed';
        }
        console.log(`❌ Image ${currentImageNum} failed`);
      }
    }

    // Update filename
    const parsedImageName = this.extractImageNameFromMessage(message);
    if (parsedImageName && parsedImageName !== this.currentImageName) {
      this.currentImageName = parsedImageName;
      console.log('Updated current image name:', parsedImageName);
    }

    // Fallback to file list if no name found
    if (!this.currentImageName && this.data.files && this.currentImageIndex < this.data.files.length) {
      this.currentImageName = this.data.files[this.currentImageIndex].name;
    }
  }

  // Enhanced thumbnail status methods
  getThumbnailStatus(index: number): 'completed' | 'processing' | 'pending' | 'failed' {
    return this.thumbnailStates[index] || 'pending';
  }

  isThumbnailCompleted(index: number): boolean {
    return this.thumbnailStates[index] === 'completed';
  }

  isThumbnailProcessing(index: number): boolean {
    return this.thumbnailStates[index] === 'processing';
  }

  isThumbnailPending(index: number): boolean {
    return this.thumbnailStates[index] === 'pending';
  }

  isThumbnailFailed(index: number): boolean {
    return this.thumbnailStates[index] === 'failed';
  }

  private extractImageNameFromMessage(message: string): string | null {
    const patterns = [
      /:\s*([^:]+\.(jpg|jpeg|png|gif|bmp|webp))/i,
      /processing\s+([^:\s]+\.(jpg|jpeg|png|gif|bmp|webp))/i,
      /\(([^)]+\.(jpg|jpeg|png|gif|bmp|webp))\)/i,
      /Image\s+\d+\/\d+\s*\(([^)]+)\)/i,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    return null;
  }

  setError(errorMessage: string) {
    this.hasError = true;
    this.errorMessage = errorMessage;
    this.isProcessing = false;
    this.canRetry = true;
    
    // Mark current processing image as failed
    if (this.currentImageIndex < this.thumbnailStates.length) {
      this.thumbnailStates[this.currentImageIndex] = 'failed';
    }
    
    this.addStatusMessage(`Error: ${errorMessage}`, 'error');
    console.error('❌ Processing error:', errorMessage);
  }

  setComplete(result?: any) {
    this.isProcessing = false;
    this.progress = 100;
    this.currentStageIndex = this.processingStages.length - 1;

    // Mark all remaining images as completed
    for (let i = 0; i < this.thumbnailStates.length; i++) {
      if (this.thumbnailStates[i] === 'processing' || this.thumbnailStates[i] === 'pending') {
        this.thumbnailStates[i] = 'completed';
      }
    }

    if (this.isMultipleMode) {
      this.processedImages = this.totalImages;
      this.successfulImages = Math.max(this.successfulImages, this.totalImages);
      this.currentStage = `Analysis Complete! Processed ${this.totalImages} images`;
      this.addStatusMessage(
        `Successfully analyzed ${this.totalImages} images in ${this.getElapsedTime()}!`,
        'success'
      );
    } else {
      this.currentStage = 'Analysis Complete!';
      this.addStatusMessage(
        `Analysis completed successfully in ${this.getElapsedTime()}!`,
        'success'
      );
    }

    if (this.data.onComplete) {
      this.data.onComplete(result);
    }

    console.log('✅ Processing completed successfully');

    // Store the result for the Next button
    this.processingResult = result;
    
    // Don't auto-close anymore - let user click Next button
    // setTimeout(() => {
    //   this.dialogRef.close(result);
    // }, 2000);
  }

  addStatusMessage(text: string, type: 'info' | 'success' | 'warning' | 'error') {
    this.statusMessages.push({
      text,
      type,
      timestamp: new Date(),
    });

    // Limit messages
    if (this.statusMessages.length > 15) {
      this.statusMessages = this.statusMessages.slice(-15);
    }

    // Check scroll position and handle auto-scroll intelligently
    setTimeout(() => {
      const messages = document.querySelector('.status-messages') as HTMLElement;
      if (messages) {
        this.messagesContainer = messages;
        const isNearBottom = messages.scrollTop >= messages.scrollHeight - messages.clientHeight - 50;
        
        if (isNearBottom) {
          // User is at bottom, auto-scroll to new message
          messages.scrollTop = messages.scrollHeight;
          this.hasUnreadMessages = false;
        } else {
          // User has scrolled up, don't interrupt them but mark as having unread messages
          this.hasUnreadMessages = true;
        }
      }
    }, 50);
  }

  // Method to scroll to bottom when user clicks the indicator
  scrollToLatestMessage() {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
      this.hasUnreadMessages = false;
    }
  }

  // Method to check if there are unread messages
  hasNewMessages(): boolean {
    return this.hasUnreadMessages;
  }

  // Method to proceed to comic matcher
  proceedToMatcher() {
    console.log('🎯 Proceeding to comic matcher with result:', this.processingResult);
    this.dialogRef.close({ 
      action: 'proceed_to_matcher', 
      result: this.processingResult 
    });
  }

  // Method to check if processing is complete and results are available
  isCompleteWithResults(): boolean {
    return !this.isProcessing && !this.hasError && this.processingResult != null;
  }

  retryProcessing() {
    this.hasError = false;
    this.errorMessage = '';
    this.isProcessing = true;
    this.progress = 0;
    this.currentStageIndex = 0;
    this.canRetry = false;
    this.statusMessages = [];
    this.startTime = new Date();
    this.hasReceivedRealProgress = false;

    // Reset counters and states
    this.currentImageIndex = 0;
    this.processedImages = 0;
    this.successfulImages = 0;
    this.failedImages = 0;
    this.lastUpdateTime = 0;
    this.lastProgressValue = 0;
    this.lastStage = '';

    // Reset thumbnail states
    this.initializeThumbnailStates();

    if (this.isMultipleMode && this.data.files) {
      this.currentImageName = this.data.files[0]?.name || '';
      this.addStatusMessage(`Retrying analysis of ${this.totalImages} images...`, 'info');
    } else {
      this.currentImageName = this.data.file?.name || '';
      this.addStatusMessage('Retrying image analysis...', 'info');
    }

    console.log('🔄 Retrying processing...');
  }

  // Helper methods
  getCurrentTime(): string {
    return this.startTime.toLocaleTimeString();
  }

  getElapsedTime(): string {
    const elapsed = Date.now() - this.startTime.getTime();
    return `${Math.round(elapsed / 1000)}s`;
  }

  getMainImagePreview(): string | null {
    if (this.isMultipleMode && this.currentImageIndex < this.imagePreviews.length) {
      return this.imagePreviews[this.currentImageIndex] || this.imagePreviews[0];
    }
    return this.imagePreviews[0] || null;
  }

  getTotalFileSize(): number {
    if (this.isMultipleMode && this.data.files) {
      return this.data.files.reduce((total, file) => total + file.size, 0);
    }
    return this.data.file?.size || 0;
  }

  getDisplayFilename(): string {
    if (this.isMultipleMode) {
      if (this.currentImageName) {
        return `${this.currentImageName} (${Math.min(this.processedImages + 1, this.totalImages)}/${this.totalImages})`;
      }
      return `${this.totalImages} images selected`;
    }
    return this.data.file?.name || 'Unknown file';
  }

  getCurrentImageProgress(): string {
    if (!this.isMultipleMode) return '';
    return `${Math.min(this.processedImages, this.totalImages)}/${this.totalImages}`;
  }

  getProgressSummary(): string {
    if (!this.isMultipleMode) return '';

    if (this.isProcessing) {
      if (this.currentImageName) {
        return `Processing ${this.currentImageName} (${Math.min(this.processedImages + 1, this.totalImages)}/${this.totalImages})`;
      } else {
        return `Processing image ${Math.min(this.processedImages + 1, this.totalImages)}/${this.totalImages}`;
      }
    } else if (this.hasError) {
      return `Failed: ${this.failedImages} of ${this.totalImages}`;
    } else {
      return `Completed: ${this.successfulImages} of ${this.totalImages}`;
    }
  }

  getMessageIcon(type: string): string {
    switch (type) {
      case 'success': return 'check_circle';
      case 'warning': return 'warning';
      case 'error': return 'error';
      default: return 'info';
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private scrollToTop(): void {
    const content = document.querySelector('.dialog-content');
    if (content) content.scrollTop = 0;
  }

  isSmallScreen(): boolean {
    return window.innerWidth <= 768;
  }
}