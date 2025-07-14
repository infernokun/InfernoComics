// image-processing-dialog.component.ts
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
  
  // Expose Math for template
  Math = Math;

  processingStages = [
    { name: 'Uploading image', key: 'upload' },
    { name: 'Extracting features', key: 'features' },
    { name: 'Comparing with database', key: 'compare' },
    { name: 'Analyzing matches', key: 'analyze' },
    { name: 'Finalizing results', key: 'finalize' }
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

  updateProgress(stage: string, progressPercent: number, message?: string) {
    this.currentStage = stage;
    this.progress = Math.min(100, Math.max(0, progressPercent));
    
    // Update current stage index based on stage name
    const stageIndex = this.processingStages.findIndex(s => 
      stage.toLowerCase().includes(s.key.toLowerCase())
    );
    if (stageIndex >= 0) {
      this.currentStageIndex = stageIndex;
    }

    if (message) {
      this.addStatusMessage(message, 'info');
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
    this.currentStage = 'Complete!';
    this.currentStageIndex = this.processingStages.length - 1;
    this.addStatusMessage('Image analysis completed successfully!', 'success');
    
    if (this.data.onComplete) {
      this.data.onComplete(result);
    }

    // Auto-close after a short delay
    setTimeout(() => {
      this.dialogRef.close(result);
    }, 1500);
  }

  addStatusMessage(text: string, type: 'info' | 'success' | 'warning' | 'error') {
    this.statusMessages.push({
      text,
      type,
      timestamp: new Date()
    });

    // Limit to last 10 messages
    if (this.statusMessages.length > 10) {
      this.statusMessages = this.statusMessages.slice(-10);
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

  retryProcessing() {
    this.hasError = false;
    this.errorMessage = '';
    this.isProcessing = true;
    this.progress = 0;
    this.currentStageIndex = 0;
    this.currentStage = 'Retrying...';
    this.canRetry = false;
    this.statusMessages = [];
    this.addStatusMessage('Retrying image analysis...', 'info');
    
    // Call parent's retry logic or simulate again
    this.simulateProcessing();
  }

  private simulateProcessing() {
    // This is a fallback simulation - replace with actual processing logic
    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress += Math.random() * 15;
      
      if (currentProgress >= 100) {
        currentProgress = 100;
        this.setComplete();
        clearInterval(interval);
      } else {
        const stageIndex = Math.floor((currentProgress / 100) * this.processingStages.length);
        const stageName = this.processingStages[stageIndex]?.name || 'Processing...';
        this.updateProgress(stageName, currentProgress);
      }
    }, 500);
  }
}