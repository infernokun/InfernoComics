import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../material.module';

export interface ImageProcessingData {
  file?: File;  // Single file (optional for backward compatibility)
  files?: File[];  // Multiple files
  seriesId: number;
  isMultiple?: boolean;  // Flag to indicate multiple images mode
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
  
  // Debouncing properties
  private lastUpdateTime = 0;
  private lastProgressValue = 0;
  private readonly UPDATE_DEBOUNCE_MS = 150; // Prevent rapid updates
  
  // Expose Math for template
  Math = Math;

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

  constructor(
    public dialogRef: MatDialogRef<ImageProcessingDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ImageProcessingData
  ) {}

  ngOnInit() {
    this.setupImageProcessing();
    this.createImagePreviews();
    this.addInitialStatusMessage();
    
    // Simulate the processing stages if not provided by parent
    if (!this.data.onProgress) {
      this.simulateProcessing();
    }

    // Scroll to top
    setTimeout(() => this.scrollToTop(), 0);
  }

  ngOnDestroy() {
    // Clean up all image previews
    this.imagePreviews.forEach(preview => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    });
  }

  private setupImageProcessing() {
    // Determine if this is multiple images mode
    this.isMultipleMode = this.data.isMultiple || (this.data.files! && this.data.files.length > 1);
    
    if (this.isMultipleMode && this.data.files) {
      this.totalImages = this.data.files.length;
      this.currentImageIndex = 0;
      this.currentImageName = this.data.files[0]?.name || '';
      this.processedImages = 0; // Start at 0, will increment as we process
    } else {
      this.totalImages = 1;
      this.currentImageName = this.data.file?.name || '';
      this.processedImages = 0;
    }
  }

  private createImagePreviews() {
    if (this.isMultipleMode && this.data.files) {
      // Create previews for all images
      this.imagePreviews = this.data.files.map(file => URL.createObjectURL(file));
    } else if (this.data.file) {
      // Single image preview
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

  getCurrentTime(): string {
    return this.startTime.toLocaleTimeString();
  }

  getElapsedTime(): string {
    const elapsed = Date.now() - this.startTime.getTime();
    return `${Math.round(elapsed / 1000)}s`;
  }

  // Get the main display image (first image or current processing image)
  getMainImagePreview(): string | null {
    if (this.isMultipleMode && this.currentImageIndex < this.imagePreviews.length) {
      return this.imagePreviews[this.currentImageIndex] || this.imagePreviews[0];
    }
    return this.imagePreviews[0] || null;
  }

  // Get total file size for multiple images
  getTotalFileSize(): number {
    if (this.isMultipleMode && this.data.files) {
      return this.data.files.reduce((total, file) => total + file.size, 0);
    }
    return this.data.file?.size || 0;
  }

  // Get display filename
  getDisplayFilename(): string {
    if (this.isMultipleMode) {
      if (this.currentImageName) {
        return `${this.currentImageName} (${this.processedImages + 1}/${this.totalImages})`;
      }
      return `${this.totalImages} images selected`;
    }
    return this.data.file?.name || 'Unknown file';
  }

  updateProgress(stage: string, progressPercent: number, message?: string) {
    const now = Date.now();
    
    // Debounce rapid updates that don't significantly change progress
    if (now - this.lastUpdateTime < this.UPDATE_DEBOUNCE_MS && 
        Math.abs(progressPercent - this.lastProgressValue) < 1) {
      return; // Skip minor updates that happen too quickly
    }
    
    // Ensure progress only moves forward to prevent jumping
    const newProgress = Math.min(100, Math.max(this.progress, progressPercent));
    
    // Only update if progress actually increased OR stage changed OR significant time passed
    if (newProgress > this.progress || 
        stage !== this.currentStage || 
        now - this.lastUpdateTime > 1000) { // Force update every second
      
      this.lastUpdateTime = now;
      this.lastProgressValue = newProgress;
      this.progress = newProgress;
      this.currentStage = stage;
      
      // Map stage to index more reliably
      const mappedIndex = this.stageMapping[stage];
      if (mappedIndex !== undefined) {
        // Only advance stage index, never go backwards
        this.currentStageIndex = Math.max(this.currentStageIndex, mappedIndex);
      } else {
        // Fallback: try to match by stage name
        const stageIndex = this.processingStages.findIndex(s => 
          stage.toLowerCase().includes(s.key.toLowerCase()) ||
          s.name.toLowerCase().includes(stage.toLowerCase())
        );
        if (stageIndex >= 0) {
          this.currentStageIndex = Math.max(this.currentStageIndex, stageIndex);
        }
      }

      // Parse image-specific progress from message BEFORE adding status message
      if (message && this.isMultipleMode) {
        this.parseImageProgress(message);
      }

      if (message) {
        this.addStatusMessage(message, 'info');
      }
    }
  }

  private parseImageProgress(message: string) {
    console.log('Parsing progress message:', message); // Debug log
    
    // Parse messages like "Processing image 2/5: filename.jpg" or "Image 1/3: Processing candidate 15/50"
    const imageMatch = message.match(/(?:image|Image)\s+(\d+)(?:\/(\d+))?/i);
    if (imageMatch) {
      const currentImageNum = parseInt(imageMatch[1]);
      const totalImages = imageMatch[2] ? parseInt(imageMatch[2]) : this.totalImages;
      
      // Convert to 0-based index and ensure we don't go backwards
      const newImageIndex = currentImageNum - 1;
      if (newImageIndex >= this.currentImageIndex && newImageIndex < this.totalImages) {
        this.currentImageIndex = newImageIndex;
        
        // Update processed count more carefully
        if (currentImageNum > this.processedImages) {
          this.processedImages = currentImageNum;
        }
      }
      
      console.log(`Parsed: currentImageNum=${currentImageNum}, newImageIndex=${newImageIndex}, processedImages=${this.processedImages}`);
    }

    // Parse image name from various message patterns
    let parsedImageName = null;
    
    // Pattern 1: "Processing image 1/3: filename.jpg"
    const nameMatch1 = message.match(/:\s*([^:]+\.(jpg|jpeg|png|gif|bmp|webp))/i);
    if (nameMatch1) {
      parsedImageName = nameMatch1[1].trim();
    }
    
    // Pattern 2: "Processing filename.jpg..."
    if (!parsedImageName) {
      const nameMatch2 = message.match(/processing\s+([^:\s]+\.(jpg|jpeg|png|gif|bmp|webp))/i);
      if (nameMatch2) {
        parsedImageName = nameMatch2[1].trim();
      }
    }
    
    // Pattern 3: Extract from parentheses "Image 1/3 (filename.jpg):"
    if (!parsedImageName) {
      const nameMatch3 = message.match(/\(([^)]+\.(jpg|jpeg|png|gif|bmp|webp))\)/i);
      if (nameMatch3) {
        parsedImageName = nameMatch3[1].trim();
      }
    }
    
    // Update current image name if we found one and it's valid
    if (parsedImageName && parsedImageName !== this.currentImageName) {
      this.currentImageName = parsedImageName;
      console.log('Updated current image name to:', parsedImageName);
    }
    
    // If we don't have a name from message, use the file at current index
    if (!this.currentImageName && this.data.files && this.currentImageIndex < this.data.files.length) {
      this.currentImageName = this.data.files[this.currentImageIndex].name;
    }

    // Update success/failure counters based on completion messages
    if (message.includes('completed') && !message.includes('processing')) {
      this.successfulImages = Math.max(this.successfulImages, this.processedImages);
    }
    if (message.includes('failed') || message.includes('error')) {
      this.failedImages++;
    }
  }

  setError(errorMessage: string) {
    this.hasError = true;
    this.errorMessage = errorMessage;
    this.isProcessing = false;
    this.canRetry = true;
    this.addStatusMessage(`Error: ${errorMessage}`, 'error');
  }

  setComplete(result?: any) {
    this.isProcessing = false;
    this.progress = 100;
    this.currentStageIndex = this.processingStages.length - 1;
    
    // Final update for multiple images
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

    // Auto-close after a short delay
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

    // Limit to last 15 messages
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

  retryProcessing() {
    this.hasError = false;
    this.errorMessage = '';
    this.isProcessing = true;
    this.progress = 0;
    this.currentStageIndex = 0;
    this.canRetry = false;
    this.statusMessages = [];
    this.startTime = new Date();
    
    // Reset multiple images counters
    this.currentImageIndex = 0;
    this.processedImages = 0;
    this.successfulImages = 0;
    this.failedImages = 0;
    this.lastUpdateTime = 0;
    this.lastProgressValue = 0;
    
    // Reset current image name
    if (this.isMultipleMode && this.data.files && this.data.files.length > 0) {
      this.currentImageName = this.data.files[0].name;
      this.currentStage = 'Retrying multiple images...';
      this.addStatusMessage(`Retrying analysis of ${this.totalImages} images...`, 'info');
    } else {
      this.currentImageName = this.data.file?.name || '';
      this.currentStage = 'Retrying...';
      this.addStatusMessage('Retrying image analysis...', 'info');
    }
    
    // Call parent's retry logic or simulate again
    this.simulateProcessing();
  }

  private simulateProcessing() {
    // This is a fallback simulation - replace with actual processing logic
    let currentProgress = 0;
    let stageIndex = 0;
    
    const interval = setInterval(() => {
      // More controlled progress increments
      const increment = Math.random() * 8 + 2; // 2-10% increments
      currentProgress = Math.min(100, currentProgress + increment);
      
      // Update stage index based on progress ranges
      const newStageIndex = Math.floor((currentProgress / 100) * this.processingStages.length);
      if (newStageIndex > stageIndex && newStageIndex < this.processingStages.length) {
        stageIndex = newStageIndex;
        this.addStatusMessage(`Starting: ${this.processingStages[stageIndex].name}`, 'info');
      }
      
      // Simulate multiple images progress
      if (this.isMultipleMode && currentProgress > 25 && currentProgress < 90) {
        const imageProgress = Math.floor(((currentProgress - 25) / 65) * this.totalImages) + 1;
        const newImageIndex = Math.min(imageProgress - 1, this.totalImages - 1);
        
        // Only update if moving forward
        if (newImageIndex >= this.currentImageIndex) {
          this.currentImageIndex = newImageIndex;
          this.processedImages = imageProgress;
          const fileName = this.data.files?.[this.currentImageIndex]?.name || `image_${this.currentImageIndex + 1}.jpg`;
          this.currentImageName = fileName;
        }
      }
      
      if (currentProgress >= 100) {
        this.setComplete();
        clearInterval(interval);
      } else {
        const stageName = this.processingStages[stageIndex]?.name || 'Processing...';
        const stageKey = this.processingStages[stageIndex]?.key || 'processing';
        this.updateProgress(stageKey, currentProgress);
      }
    }, 400); // Slower updates to reduce jumping
  }

  private scrollToTop(): void {
    const content = document.querySelector('.dialog-content');
    if (content) content.scrollTop = 0;
  }

  // Helper methods for template
  getCurrentImageProgress(): string {
    if (!this.isMultipleMode) return '';
    return `${Math.min(this.processedImages, this.totalImages)}/${this.totalImages}`;
  }

  getProgressSummary(): string {
    if (!this.isMultipleMode) return '';
    
    if (this.isProcessing) {
      if (this.currentImageName) {
        return `Processing ${this.currentImageName} (${Math.min(this.processedImages, this.totalImages)}/${this.totalImages})`;
      } else {
        return `Processing image ${Math.min(this.processedImages, this.totalImages)}/${this.totalImages}`;
      }
    } else if (this.hasError) {
      return `Failed: ${this.failedImages} of ${this.totalImages}`;
    } else {
      return `Completed: ${this.successfulImages} of ${this.totalImages}`;
    }
  }
}