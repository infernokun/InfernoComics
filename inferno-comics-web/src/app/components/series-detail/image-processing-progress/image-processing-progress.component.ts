import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../material.module';

export interface ImageProcessingData {
  file: File;
  seriesId: number;
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
  imagePreview: string | null = null;
  progress = 0;
  currentStage = 'Preparing...';
  currentStageIndex = 0;
  isProcessing = true;
  hasError = false;
  errorMessage = '';
  canRetry = false;
  startTime = new Date();
  
  // Expose Math for template
  Math = Math;

  // Stage mapping for better progress tracking
  private stageMapping: { [key: string]: number } = {
    'processing_data': 0,
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
    this.createImagePreview();
    this.addStatusMessage('Starting image analysis...', 'info');
    
    // Simulate the processing stages if not provided by parent
    if (!this.data.onProgress) {
      this.simulateProcessing();
    }

    // Scroll to top
    setTimeout(() => this.scrollToTop(), 0);
  }

  ngOnDestroy() {
    if (this.imagePreview) {
      URL.revokeObjectURL(this.imagePreview);
    }
  }

  private createImagePreview() {
    if (this.data.file) {
      this.imagePreview = URL.createObjectURL(this.data.file);
    }
  }

  getCurrentTime(): string {
    return this.startTime.toLocaleTimeString();
  }

  getElapsedTime(): string {
    const elapsed = Date.now() - this.startTime.getTime();
    return `${Math.round(elapsed / 1000)}s`;
  }

  updateProgress(stage: string, progressPercent: number, message?: string) {
    // Ensure progress only moves forward to prevent jumping
    const newProgress = Math.min(100, Math.max(this.progress, progressPercent));
    
    // Only update if progress actually increased or stage changed
    if (newProgress > this.progress || stage !== this.currentStage) {
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

      if (message) {
        this.addStatusMessage(message, 'info');
      }
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
    this.currentStage = 'Analysis Complete!';
    this.currentStageIndex = this.processingStages.length - 1;
    this.addStatusMessage(`Analysis completed successfully in ${this.getElapsedTime()}!`, 'success');
    
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
    this.currentStage = 'Retrying...';
    this.canRetry = false;
    this.statusMessages = [];
    this.startTime = new Date();
    this.addStatusMessage('Retrying image analysis...', 'info');
    
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
}