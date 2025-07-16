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
  imports: [CommonModule, MaterialModule]
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
  
  // Progress tracking
  private lastUpdateTime = 0;
  private lastProgressValue = 0;
  private lastStage = '';
  private readonly UPDATE_DEBOUNCE_MS = 100; // Reduced debounce time
  
  // DISABLE SIMULATION - only use real progress
  private hasReceivedRealProgress = false;
  
  // Stage mapping for better progress tracking
  private stageMapping: { [key: string]: number } = {
    'processing_data': 0,
    'preparing': 0,
    'initializing_matcher': 1,
    'extracting_features': 1,
    'comparing_images': 2,
    'processing_results': 3,
    'finalizing': 4,
    'complete': 4
  };

  processingStages = [
    { name: 'Processing data', key: 'processing_data' },
    { name: 'Extracting features', key: 'extracting_features' },
    { name: 'Comparing images', key: 'comparing_images' },
    { name: 'Processing results', key: 'processing_results' },
    { name: 'Finalizing', key: 'finalizing' }
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
    this.addInitialStatusMessage();
    
    // DON'T START SIMULATION - wait for real progress
    console.log(' ImageProcessingDialog initialized - waiting for real progress updates');
    
    setTimeout(() => this.scrollToTop(), 0);
  }

  ngOnDestroy() {
    this.imagePreviews.forEach(preview => {
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
      this.imagePreviews = this.data.files.map(file => URL.createObjectURL(file));
    } else if (this.data.file) {
      this.imagePreviews = [URL.createObjectURL(this.data.file)];
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
    // Mark that we've received real progress
    this.hasReceivedRealProgress = true;
    
    const now = Date.now();
    
    // Smart debouncing - allow important updates through
    const isImportantUpdate = (
      stage !== this.lastStage ||
      progressPercent >= 100 ||
      stage === 'complete' ||
      Math.abs(progressPercent - this.lastProgressValue) >= 5 ||
      now - this.lastUpdateTime > 1000 // Force update every second
    );
    
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

      // Parse multi-image progress BEFORE adding status message
      if (message && this.isMultipleMode) {
        this.parseImageProgress(message);
      }

      if (message) {
        this.addStatusMessage(message, 'info');
      }
      
      console.log(` Progress update: ${stage} ${newProgress}% - ${message || ''}`);
    }
  }

  private parseImageProgress(message: string) {
    console.log(' Parsing multi-image progress:', message);
    
    // IMPROVED: Parse various message formats more reliably
    // Format 1: "Processing image 2/5: filename.jpg"
    // Format 2: "Image 1/3 (filename.jpg): Candidate 15/50"
    // Format 3: "Completed image 2/5: filename.jpg - 3 matches found"
    
    const imageMatch = message.match(/(?:image|Image)\s+(\d+)(?:\/(\d+))?/i);
    if (imageMatch) {
      const currentImageNum = parseInt(imageMatch[1]);
      const totalImages = imageMatch[2] ? parseInt(imageMatch[2]) : this.totalImages;
      
      // Convert to 0-based index
      const newImageIndex = Math.max(0, Math.min(currentImageNum - 1, this.totalImages - 1));
      
      // Only update if moving forward or staying current
      if (newImageIndex >= this.currentImageIndex) {
        this.currentImageIndex = newImageIndex;
        
        // Update processed count more accurately
        if (message.includes('Completed') || message.includes('matches found')) {
          this.processedImages = Math.max(this.processedImages, currentImageNum);
          this.successfulImages = Math.max(this.successfulImages, currentImageNum);
        } else if (message.includes('Processing') || message.includes('Candidate')) {
          // Don't increment processed count for "Processing" messages
          // Only update current image tracking
        }
      }
      
      console.log(` Image tracking: currentImageNum=${currentImageNum}, index=${newImageIndex}, processed=${this.processedImages}`);
    }

    // Enhanced filename parsing
    let parsedImageName = this.extractImageNameFromMessage(message);
    if (parsedImageName && parsedImageName !== this.currentImageName) {
      this.currentImageName = parsedImageName;
      console.log(' Updated current image name:', parsedImageName);
    }
    
    // Fallback to file list if no name found
    if (!this.currentImageName && this.data.files && this.currentImageIndex < this.data.files.length) {
      this.currentImageName = this.data.files[this.currentImageIndex].name;
    }

    // Update counters based on completion messages
    if (message.includes('Failed') || message.includes('error')) {
      this.failedImages++;
    }
  }

  private extractImageNameFromMessage(message: string): string | null {
    // Try multiple patterns to extract filename
    const patterns = [
      /:\s*([^:]+\.(jpg|jpeg|png|gif|bmp|webp))/i,      // Pattern 1: ": filename.jpg"
      /processing\s+([^:\s]+\.(jpg|jpeg|png|gif|bmp|webp))/i,  // Pattern 2: "processing filename.jpg"
      /\(([^)]+\.(jpg|jpeg|png|gif|bmp|webp))\)/i,      // Pattern 3: "(filename.jpg)"
      /Image\s+\d+\/\d+\s*\(([^)]+)\)/i,               // Pattern 4: "Image 1/3 (filename.jpg)"
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
    this.addStatusMessage(`Error: ${errorMessage}`, 'error');
    console.error('❌ Processing error:', errorMessage);
  }

  setComplete(result?: any) {
    this.isProcessing = false;
    this.progress = 100;
    this.currentStageIndex = this.processingStages.length - 1;
    
    if (this.isMultipleMode) {
      this.processedImages = this.totalImages;
      this.successfulImages = Math.max(this.successfulImages, this.totalImages);
      this.currentStage = `Analysis Complete! Processed ${this.totalImages} images`;
      this.addStatusMessage(`Successfully analyzed ${this.totalImages} images in ${this.getElapsedTime()}!`, 'success');
    } else {
      this.currentStage = 'Analysis Complete!';
      this.addStatusMessage(`Analysis completed successfully in ${this.getElapsedTime()}!`, 'success');
    }
    
    if (this.data.onComplete) {
      this.data.onComplete(result);
    }

    console.log('✅ Processing completed successfully');
    
    // Auto-close after delay
    setTimeout(() => {
      this.dialogRef.close(result);
    }, 2000);
  }

  addStatusMessage(text: string, type: 'info' | 'success' | 'warning' | 'error') {
    this.statusMessages.push({
      text,
      type,
      timestamp: new Date()
    });

    // Limit messages
    if (this.statusMessages.length > 15) {
      this.statusMessages = this.statusMessages.slice(-15);
    }

    // Auto-scroll to bottom
    setTimeout(() => {
      const messages = document.querySelector('.status-messages');
      if (messages) {
        messages.scrollTop = messages.scrollHeight;
      }
    }, 50);
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
    
    // Reset counters
    this.currentImageIndex = 0;
    this.processedImages = 0;
    this.successfulImages = 0;
    this.failedImages = 0;
    this.lastUpdateTime = 0;
    this.lastProgressValue = 0;
    this.lastStage = '';
    
    if (this.isMultipleMode && this.data.files) {
      this.currentImageName = this.data.files[0]?.name || '';
      this.addStatusMessage(`Retrying analysis of ${this.totalImages} images...`, 'info');
    } else {
      this.currentImageName = this.data.file?.name || '';
      this.addStatusMessage('Retrying image analysis...', 'info');
    }
    
    console.log(' Retrying processing...');
    
    // REMOVED: Don't fall back to simulation
    // The parent component should handle retry logic
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
}