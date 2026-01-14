import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { MaterialModule } from '../../../../material.module';
import { ProgressData, State } from '../../../../models/progress-data.model';
import { WebsocketService, WebSocketResponseList } from '../../../../services/websocket.service';

export interface ImageProcessingData {
  file?: File;
  files?: File[];
  seriesId: number;
  sessionId?: string;
  isMultiple?: boolean;
  onProgress?: (stage: string, progress: number) => void;
  onComplete?: (result: any) => void;
  onError?: (error: any) => void;
}

type ThumbnailState = 'pending' | 'processing' | 'completed' | 'failed';
type MessageType = 'info' | 'success' | 'warning' | 'error';

interface StatusMessage {
  text: string;
  type: MessageType;
  timestamp: Date;
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

  totalImages = 0;
  currentImageIndex = 0;
  currentImageName = '';
  processedImages = 0;
  successfulImages = 0;
  failedImages = 0;

  thumbnailStates: ThumbnailState[] = [];
  
  private hasUnreadMessages = false;
  private messagesContainer: HTMLElement | null = null;
  
  processingResult: any = null;

  private wsSub?: Subscription;
  private lastUpdateTime = 0;
  private lastProgressValue = 0;
  private lastStage = '';
  private readonly UPDATE_DEBOUNCE_MS = 100;
  private readonly MAX_STATUS_MESSAGES = 15;

  private readonly stageMapping: Record<string, number> = {
    'processing_data': 0,
    'Processing Data': 0,
    'preparing': 0,
    'initializing_matcher': 1,
    'Initializing Matcher': 1,
    'extracting_features': 1,
    'Extracting Features': 1,
    'comparing_images': 2,
    'Comparing Images': 2,
    'processing_results': 3,
    'Processing Results': 3,
    'finalizing': 4,
    'Finalizing Results': 4,
    'complete': 4,
    'COMPLETED': 4,
  };

  readonly processingStages = [
    { name: 'Processing data', key: 'processing_data' },
    { name: 'Extracting features', key: 'extracting_features' },
    { name: 'Comparing images', key: 'comparing_images' },
    { name: 'Processing results', key: 'processing_results' },
    { name: 'Finalizing', key: 'finalizing' },
  ];

  statusMessages: StatusMessage[] = [];

  readonly Math = Math;

  constructor(
    public dialogRef: MatDialogRef<ImageProcessingDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ImageProcessingData,
    private websocket: WebsocketService
  ) {}

  ngOnInit(): void {
    this.setupImageProcessing();
    this.createImagePreviews();
    this.initializeThumbnailStates();
    this.addInitialStatusMessage();
    this.setupWebSocketSubscription();

    console.log('ImageProcessingDialog initialized - listening for WebSocket updates');
    setTimeout(() => this.scrollToTop(), 0);
  }

  ngOnDestroy(): void {
    this.imagePreviews.forEach(preview => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    });
    
    this.wsSub?.unsubscribe();
  }

  private setupWebSocketSubscription(): void {
    this.wsSub = this.websocket.messages$.subscribe((msg: any) => {
      const response = msg as WebSocketResponseList;
      
      // Listen for progress updates for this series
      if (response.seriesId === this.data.seriesId) {
        this.handleWebSocketMessage(response);
      }
    });
  }

  private handleWebSocketMessage(response: WebSocketResponseList): void {
    console.log('Received WebSocket message:', response.name, response);

    // Handle different message types
    switch (response.name) {
      case 'ProgressDataListTable':
      case 'ProgressDataListRelevance':
        this.handleProgressDataUpdate(response.payload);
        break;
      default:
        console.log('Unhandled WebSocket message type:', response.name);
    }
  }

  private handleProgressDataUpdate(payload: any[]): void {
    if (!payload?.length) return;

    // Find the progress data for our session (if we have a sessionId)
    // Or find the most recent PROCESSING session for this series
    let relevantProgress: ProgressData | null = null;

    if (this.data.sessionId) {
      const found = payload.find(p => p.sessionId === this.data.sessionId);
      if (found) {
        relevantProgress = new ProgressData(found);
      }
    } else {
      // Find the most recent processing or just-completed session
      const sorted = payload
        .map(p => new ProgressData(p))
        .sort((a, b) => {
          const dateA = a.timeStarted ? new Date(a.timeStarted).getTime() : 0;
          const dateB = b.timeStarted ? new Date(b.timeStarted).getTime() : 0;
          return dateB - dateA;
        });
      
      relevantProgress = sorted.find(p => p.state === State.PROCESSING) ?? sorted[0];
    }

    if (!relevantProgress) return;

    // Store sessionId for future reference
    if (!this.data.sessionId && relevantProgress.sessionId) {
      this.data.sessionId = relevantProgress.sessionId;
    }

    console.log('Processing WebSocket update:', {
      state: relevantProgress.state,
      percentageComplete: relevantProgress.percentageComplete,
      currentStage: relevantProgress.currentStage,
      statusMessage: relevantProgress.statusMessage,
      processedItems: relevantProgress.processedItems,
      totalItems: relevantProgress.totalItems,
    });

    // Update component state based on progress data
    this.updateFromProgressData(relevantProgress);
  }

  private updateFromProgressData(progressData: ProgressData): void {
    const state = progressData.state;
    const percentage = progressData.percentageComplete ?? 0;
    const stage = progressData.currentStage ?? 'Processing';
    const message = progressData.statusMessage ?? '';

    // Update progress
    if (percentage >= this.progress) {
      this.progress = percentage;
    }

    // Update stage
    if (stage && stage !== this.currentStage) {
      this.currentStage = stage;
      const mappedIndex = this.stageMapping[stage];
      if (mappedIndex !== undefined) {
        this.currentStageIndex = Math.max(this.currentStageIndex, mappedIndex);
      }
      this.addStatusMessage(`Stage: ${stage}`, 'info');
    }

    // Update item counts
    if (progressData.totalItems && progressData.totalItems !== this.totalImages) {
      this.totalImages = progressData.totalItems;
      this.initializeThumbnailStates();
    }

    if (progressData.processedItems !== undefined) {
      const prevProcessed = this.processedImages;
      this.processedImages = progressData.processedItems;
      
      // Update thumbnail states based on processed count
      this.updateThumbnailStatesFromCount(prevProcessed, this.processedImages);
    }

    if (progressData.successfulItems !== undefined) {
      this.successfulImages = progressData.successfulItems;
    }

    if (progressData.failedItems !== undefined) {
      this.failedImages = progressData.failedItems;
    }

    // Parse additional info from status message
    if (message) {
      this.parseStatusMessage(message);
    }

    // Handle state transitions
    switch (state) {
      case State.COMPLETED:
        this.handleCompletion(progressData);
        break;
      case State.ERROR:
        this.handleError(progressData.errorMessage ?? 'Processing failed');
        break;
      case State.PROCESSING:
        this.isProcessing = true;
        break;
    }
  }

  private updateThumbnailStatesFromCount(prevCount: number, newCount: number): void {
    // Mark newly processed images as completed
    for (let i = prevCount; i < newCount && i < this.thumbnailStates.length; i++) {
      if (this.thumbnailStates[i] === 'processing' || this.thumbnailStates[i] === 'pending') {
        this.thumbnailStates[i] = 'completed';
      }
    }

    // Mark current image as processing
    if (newCount < this.totalImages && newCount < this.thumbnailStates.length) {
      this.currentImageIndex = newCount;
      if (this.thumbnailStates[newCount] === 'pending') {
        this.thumbnailStates[newCount] = 'processing';
      }
    }
  }

  private parseStatusMessage(message: string): void {
    // Extract image name if present
    const imageMatch = message.match(/(?:Image|image)\s+(\d+)(?:\/(\d+))?/i);
    if (imageMatch) {
      const currentImageNum = parseInt(imageMatch[1], 10);
      const newIndex = Math.max(0, Math.min(currentImageNum - 1, this.totalImages - 1));
      
      if (newIndex !== this.currentImageIndex) {
        this.markThumbnailState(this.currentImageIndex, 'completed');
        this.currentImageIndex = newIndex;
        this.markThumbnailState(newIndex, 'processing');
      }
    }

    // Extract filename if present
    const filenameMatch = message.match(/:\s*([^:]+\.(jpg|jpeg|png|gif|bmp|webp))/i) ||
                          message.match(/\(([^)]+\.(jpg|jpeg|png|gif|bmp|webp))\)/i);
    if (filenameMatch) {
      this.currentImageName = filenameMatch[1].trim();
    }

    // Check for completion/failure indicators
    if (message.toLowerCase().includes('completed') || message.toLowerCase().includes('matches found')) {
      this.markThumbnailState(this.currentImageIndex, 'completed');
    } else if (message.toLowerCase().includes('failed') || message.toLowerCase().includes('error')) {
      this.markThumbnailState(this.currentImageIndex, 'failed');
      this.failedImages++;
    }

    // Add to status messages (avoid duplicates)
    const lastMessage = this.statusMessages[this.statusMessages.length - 1];
    if (!lastMessage || lastMessage.text !== message) {
      this.addStatusMessage(message, this.getMessageTypeFromContent(message));
    }
  }

  private getMessageTypeFromContent(message: string): MessageType {
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('error') || lowerMessage.includes('failed')) {
      return 'error';
    }
    if (lowerMessage.includes('completed') || lowerMessage.includes('success')) {
      return 'success';
    }
    if (lowerMessage.includes('warning')) {
      return 'warning';
    }
    return 'info';
  }

  private handleCompletion(progressData: ProgressData): void {
    this.isProcessing = false;
    this.progress = 100;
    this.currentStageIndex = this.processingStages.length;
    this.currentStage = 'Complete!';

    // Mark all remaining images as completed
    this.thumbnailStates = this.thumbnailStates.map(state =>
      state === 'processing' || state === 'pending' ? 'completed' : state
    );

    this.processedImages = this.totalImages;
    this.successfulImages = this.thumbnailStates.filter(s => s === 'completed').length;
    this.failedImages = this.thumbnailStates.filter(s => s === 'failed').length;

    this.addStatusMessage(
      `Successfully analyzed ${this.successfulImages} image${this.successfulImages !== 1 ? 's' : ''} in ${this.getElapsedTime()}!`,
      'success'
    );

    // Store result for the Next button
    this.processingResult = {
      sessionId: progressData.sessionId,
      seriesId: this.data.seriesId,
      totalImages: this.totalImages,
      successfulImages: this.successfulImages,
      failedImages: this.failedImages,
    };

    this.data.onComplete?.(this.processingResult);
    console.log('Processing completed successfully via WebSocket');
  }

  private handleError(errorMessage: string): void {
    this.hasError = true;
    this.errorMessage = errorMessage;
    this.isProcessing = false;
    this.canRetry = true;

    this.markThumbnailState(this.currentImageIndex, 'failed');
    this.addStatusMessage(`Error: ${errorMessage}`, 'error');

    this.data.onError?.(errorMessage);
    console.error('Processing error via WebSocket:', errorMessage);
  }

  private setupImageProcessing(): void {
    if (this.data.files?.length) {
      this.totalImages = this.data.files.length;
      this.currentImageIndex = 0;
      this.currentImageName = this.data.files[0]?.name ?? '';
    } else {
      this.totalImages = 1;
      this.currentImageName = this.data.file?.name ?? '';
    }
    this.processedImages = 0;
  }

  private createImagePreviews(): void {
    if (this.data.files?.length) {
      this.imagePreviews = this.data.files.map(file => URL.createObjectURL(file));
    } else if (this.data.file) {
      this.imagePreviews = [URL.createObjectURL(this.data.file)];
    }
  }

  private initializeThumbnailStates(): void {
    this.thumbnailStates = Array<ThumbnailState>(this.totalImages).fill('pending');
    if (this.totalImages > 0) {
      this.thumbnailStates[0] = 'processing';
    }
  }

  private addInitialStatusMessage(): void {
    this.addStatusMessage(
      `Starting analysis of ${this.totalImages} image${this.totalImages !== 1 ? 's' : ''}...`,
      'info'
    );
  }

  // Public method for external progress updates (fallback if not using WebSocket)
  updateProgress(stage: string, progressPercent: number, message?: string): void {
    const now = Date.now();

    const isImportantUpdate =
      stage !== this.lastStage ||
      progressPercent >= 100 ||
      stage === 'complete' ||
      Math.abs(progressPercent - this.lastProgressValue) >= 5 ||
      now - this.lastUpdateTime > 1000;

    if (!isImportantUpdate && now - this.lastUpdateTime < this.UPDATE_DEBOUNCE_MS) {
      return;
    }

    const newProgress = Math.min(100, Math.max(this.progress, progressPercent));

    if (newProgress >= this.progress || stage !== this.currentStage) {
      this.lastUpdateTime = now;
      this.lastProgressValue = newProgress;
      this.lastStage = stage;
      this.progress = newProgress;
      this.currentStage = stage;

      const mappedIndex = this.stageMapping[stage];
      if (mappedIndex !== undefined) {
        this.currentStageIndex = Math.max(this.currentStageIndex, mappedIndex);
      }

      if (message) {
        this.parseStatusMessage(message);
      }

      console.log(`Progress update: ${stage} ${newProgress}% - ${message ?? ''}`);
    }
  }

  private markThumbnailState(index: number, state: ThumbnailState): void {
    if (index >= 0 && index < this.thumbnailStates.length) {
      this.thumbnailStates[index] = state;
    }
  }

  getThumbnailStatus(index: number): ThumbnailState {
    return this.thumbnailStates[index] ?? 'pending';
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

  setError(errorMessage: string): void {
    this.handleError(errorMessage);
  }

  setComplete(result?: any): void {
    this.isProcessing = false;
    this.progress = 100;
    this.currentStageIndex = this.processingStages.length;
    this.currentStage = 'Complete!';

    this.thumbnailStates = this.thumbnailStates.map(state =>
      state === 'processing' || state === 'pending' ? 'completed' : state
    );

    this.processedImages = this.totalImages;
    this.successfulImages = this.thumbnailStates.filter(s => s === 'completed').length;
    this.failedImages = this.thumbnailStates.filter(s => s === 'failed').length;

    this.addStatusMessage(
      `Successfully analyzed ${this.successfulImages} image${this.successfulImages !== 1 ? 's' : ''} in ${this.getElapsedTime()}!`,
      'success'
    );

    this.data.onComplete?.(result);
    console.log('Processing completed successfully');
    this.processingResult = result;
  }

  addStatusMessage(text: string, type: MessageType): void {
    this.statusMessages.push({
      text,
      type,
      timestamp: new Date(),
    });

    if (this.statusMessages.length > this.MAX_STATUS_MESSAGES) {
      this.statusMessages = this.statusMessages.slice(-this.MAX_STATUS_MESSAGES);
    }

    setTimeout(() => this.handleAutoScroll(), 50);
  }

  private handleAutoScroll(): void {
    const messages = document.querySelector('.status-messages') as HTMLElement;
    if (!messages) return;

    this.messagesContainer = messages;
    const isNearBottom = messages.scrollTop >= messages.scrollHeight - messages.clientHeight - 50;

    if (isNearBottom) {
      messages.scrollTop = messages.scrollHeight;
      this.hasUnreadMessages = false;
    } else {
      this.hasUnreadMessages = true;
    }
  }

  scrollToLatestMessage(): void {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
      this.hasUnreadMessages = false;
    }
  }

  hasNewMessages(): boolean {
    return this.hasUnreadMessages;
  }

  proceedToMatcher(): void {
    console.log('🎯 Proceeding to comic matcher with result:', this.processingResult);
    this.dialogRef.close({
      action: 'proceed_to_matcher',
      result: this.processingResult,
    });
  }

  isCompleteWithResults(): boolean {
    return !this.isProcessing && !this.hasError && this.processingResult != null;
  }

  retryProcessing(): void {
    this.hasError = false;
    this.errorMessage = '';
    this.isProcessing = true;
    this.progress = 0;
    this.currentStageIndex = 0;
    this.canRetry = false;
    this.statusMessages = [];
    this.startTime = new Date();
    this.processingResult = null;

    this.currentImageIndex = 0;
    this.processedImages = 0;
    this.successfulImages = 0;
    this.failedImages = 0;
    this.lastUpdateTime = 0;
    this.lastProgressValue = 0;
    this.lastStage = '';

    this.initializeThumbnailStates();

    if (this.data.files?.length) {
      this.currentImageName = this.data.files[0]?.name ?? '';
      this.addStatusMessage(
        `Retrying analysis of ${this.totalImages} image${this.totalImages !== 1 ? 's' : ''}...`,
        'info'
      );
    }

    console.log('🔄 Retrying processing...');
  }

  getCurrentTime(): string {
    return this.startTime.toLocaleTimeString();
  }

  getElapsedTime(): string {
    const elapsed = Date.now() - this.startTime.getTime();
    const seconds = Math.round(elapsed / 1000);

    if (seconds < 60) {
      return `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  getMainImagePreview(): string | null {
    return this.imagePreviews[this.currentImageIndex] ?? this.imagePreviews[0] ?? null;
  }

  getTotalFileSize(): number {
    if (this.data.files?.length) {
      return this.data.files.reduce((total, file) => total + file.size, 0);
    }
    return this.data.file?.size ?? 0;
  }

  getDisplayFilename(): string {
    if (this.currentImageName) {
      return `${this.currentImageName} (${Math.min(this.processedImages + 1, this.totalImages)}/${this.totalImages})`;
    }
    if (this.totalImages > 1) {
      return `${this.totalImages} images selected`;
    }
    return this.data.file?.name ?? 'Unknown file';
  }

  getCurrentImageProgress(): string {
    return `${Math.min(this.processedImages, this.totalImages)}/${this.totalImages}`;
  }

  getProgressSummary(): string {
    if (this.isProcessing) {
      const imageNum = Math.min(this.processedImages + 1, this.totalImages);
      return this.currentImageName
        ? `Processing ${this.currentImageName} (${imageNum}/${this.totalImages})`
        : `Processing image ${imageNum}/${this.totalImages}`;
    }

    if (this.hasError) {
      return `Failed: ${this.failedImages} of ${this.totalImages}`;
    }

    return `Completed: ${this.successfulImages} of ${this.totalImages}`;
  }

  getMessageIcon(type: MessageType): string {
    const icons: Record<MessageType, string> = {
      success: 'check_circle',
      warning: 'warning',
      error: 'error',
      info: 'info',
    };
    return icons[type];
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  private scrollToTop(): void {
    const content = document.querySelector('.dialog-content');
    if (content) {
      content.scrollTop = 0;
    }
  }

  isSmallScreen(): boolean {
    return window.innerWidth <= 768;
  }

  getCompletedImagesCount(): number {
    return this.thumbnailStates.filter(state => state === 'completed').length;
  }

  getFailedImagesCount(): number {
    return this.thumbnailStates.filter(state => state === 'failed').length;
  }

  getRemainingImagesCount(): number {
    return this.thumbnailStates.filter(state =>
      state === 'pending' || state === 'processing'
    ).length;
  }
}