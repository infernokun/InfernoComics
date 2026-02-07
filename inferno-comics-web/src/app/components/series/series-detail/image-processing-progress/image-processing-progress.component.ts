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
  showFullError = false;
  showProcessingLog = false;
  startTime = new Date();
  errorTime = '';
  errorStage = '';

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

    // Handle state transitions FIRST so isProcessing is set correctly
    switch (state) {
      case State.COMPLETED:
        this.handleCompletion(progressData);
        return; // handleCompletion handles everything for completed state
      case State.ERROR:
        this.handleError(progressData.errorMessage ?? 'Processing failed');
        return; // handleError handles everything for error state
      case State.PROCESSING:
        this.isProcessing = true;
        break;
    }

    // Only update progress/thumbnails if we're in PROCESSING state
    if (state !== State.PROCESSING) {
      return;
    }

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
      this.processedImages = progressData.processedItems ?? 0;

      // Only update thumbnail states if processedItems is reasonable
      if (this.processedImages < this.totalImages) {
        this.updateThumbnailStatesFromCount(this.processedImages);
      }
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
  }

  private updateThumbnailStatesFromCount(newCount: number): void {
    // newCount = number of fully completed images (0-indexed count)
    // e.g., newCount=0 means nothing done, newCount=2 means images 0,1 are complete

    // Mark all images before newCount as completed
    for (let i = 0; i < newCount && i < this.thumbnailStates.length; i++) {
      if (this.thumbnailStates[i] !== 'failed') {
        this.thumbnailStates[i] = 'completed';
      }
    }

    // Mark current image as processing (if still processing and more images remain)
    if (this.isProcessing && newCount < this.totalImages && newCount < this.thumbnailStates.length) {
      this.currentImageIndex = newCount;
      if (this.thumbnailStates[newCount] !== 'completed' &&
          this.thumbnailStates[newCount] !== 'failed') {
        this.thumbnailStates[newCount] = 'processing';
      }
    }
  }

  private parseStatusMessage(message: string): void {
    // Extract "Image X/Y" to know which image is currently being processed
    // This updates the spinner position on thumbnails
    const imageMatch = message.match(/Image\s+(\d+)\/(\d+)/i);
    if (imageMatch) {
      const currentImageNum = parseInt(imageMatch[1], 10);
      const newIndex = currentImageNum - 1; // Convert to 0-indexed

      if (newIndex >= 0 && newIndex < this.totalImages && newIndex !== this.currentImageIndex) {
        // Update current image index and thumbnail states
        this.updateCurrentProcessingImage(newIndex);
      }
    }

    // Add to status messages (avoid duplicates)
    const lastMessage = this.statusMessages[this.statusMessages.length - 1];
    if (!lastMessage || lastMessage.text !== message) {
      this.addStatusMessage(message, this.getMessageTypeFromContent(message));
    }
  }

  private updateCurrentProcessingImage(newIndex: number): void {
    // Mark all images before newIndex as completed (they must be done if we moved past them)
    for (let i = 0; i < newIndex && i < this.thumbnailStates.length; i++) {
      if (this.thumbnailStates[i] === 'processing' || this.thumbnailStates[i] === 'pending') {
        this.thumbnailStates[i] = 'completed';
      }
    }

    // Mark old processing image as completed (if different from new)
    if (this.currentImageIndex !== newIndex &&
        this.currentImageIndex < this.thumbnailStates.length &&
        this.thumbnailStates[this.currentImageIndex] === 'processing') {
      this.thumbnailStates[this.currentImageIndex] = 'completed';
    }

    // Update current index
    this.currentImageIndex = newIndex;

    // Mark new current image as processing
    if (newIndex < this.thumbnailStates.length &&
        this.thumbnailStates[newIndex] !== 'completed' &&
        this.thumbnailStates[newIndex] !== 'failed') {
      this.thumbnailStates[newIndex] = 'processing';
    }

    // Update processedImages count to match
    this.processedImages = Math.max(this.processedImages, newIndex);
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

    this.processedImages = this.totalImages ?? 0;
    this.successfulImages = this.thumbnailStates.filter(s => s === 'completed').length;
    this.failedImages = this.thumbnailStates.filter(s => s === 'failed').length;

    this.addStatusMessage(
      `Successfully analyzed ${this.successfulImages} image${this.successfulImages !== 1 ? 's' : ''} in ${this.getElapsedTime()}!`,
      'success'
    );

    // Store result for the Next button — but don't overwrite if SSE already
    if (this.processingResult?.results) {
      this.processingResult.sessionId = progressData.sessionId ?? this.processingResult.sessionId;
      this.processingResult.totalImages = this.totalImages;
      this.processingResult.successfulImages = this.successfulImages;
      this.processingResult.failedImages = this.failedImages;
    } else {
      this.processingResult = {
        sessionId: progressData.sessionId,
        seriesId: this.data.seriesId,
        totalImages: this.totalImages,
        successfulImages: this.successfulImages,
        failedImages: this.failedImages,
      };
    }

    this.data.onComplete?.(this.processingResult);
    console.log('Processing completed successfully via WebSocket');
  }

  private handleError(errorMessage: string): void {
    this.hasError = true;
    this.errorMessage = errorMessage;
    this.isProcessing = false;
    this.canRetry = true;
    this.errorTime = this.getElapsedTime(); // Capture elapsed time at moment of failure
    this.errorStage = this.currentStage; // Capture stage at moment of failure

    // Mark current image as failed, and stop any other processing states
    this.thumbnailStates = this.thumbnailStates.map((state, index) => {
      if (index === this.currentImageIndex) {
        return 'failed';
      }
      if (state === 'processing') {
        return 'pending'; // Stop spinning for any other processing thumbnails
      }
      return state;
    });

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

    this.processedImages = this.totalImages ?? 0;
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
    this.errorTime = '';
    this.errorStage = '';
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

  getMainImagePreview(): string {
    return this.imagePreviews[this.currentImageIndex] ?? this.imagePreviews[0] ?? '';
  }

  getDisplayStage(): string {
    return this.hasError ? (this.errorStage || 'Processing') : this.currentStage;
  }

  getTotalFileSize(): number {
    if (this.data.files?.length) {
      return this.data.files.reduce((total, file) => total + file.size, 0);
    }
    return this.data.file?.size ?? 0;
  }

  getCurrentFileName(): string {
    const files = this.data.files;
    if (files && files.length > this.currentImageIndex) {
      return files[this.currentImageIndex].name;
    }
    return this.data.file?.name ?? '';
  }

  getDisplayFilename(): string {
    const fileName = this.getCurrentFileName();
    if (fileName && this.totalImages > 1) {
      return `${fileName} (${this.currentImageIndex + 1}/${this.totalImages})`;
    }
    if (this.totalImages > 1) {
      return `${this.totalImages} images selected`;
    }
    return fileName || 'Unknown file';
  }

  getCurrentImageProgress(): string {
    return `${Math.min(this.processedImages, this.totalImages)}/${this.totalImages}`;
  }

  getProgressSummary(): string {
    if (this.isProcessing) {
      const fileName = this.getCurrentFileName();
      const imageNum = this.currentImageIndex + 1;
      return fileName
        ? `Processing ${fileName} (${imageNum}/${this.totalImages})`
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

  getErrorType(): string {
    if (!this.errorMessage) return 'Processing Error';

    const msg = this.errorMessage.toLowerCase();
    if (msg.includes('connection refused') || msg.includes('connect')) {
      return 'Connection Error';
    }
    if (msg.includes('timeout')) {
      return 'Timeout Error';
    }
    if (msg.includes('not found') || msg.includes('404')) {
      return 'Not Found';
    }
    if (msg.includes('unauthorized') || msg.includes('403') || msg.includes('401')) {
      return 'Auth Error';
    }
    return 'Processing Error';
  }

  getTruncatedError(): string {
    if (!this.errorMessage) return 'An unknown error occurred';

    // Extract the most meaningful part of the error
    let msg = this.errorMessage;

    // Remove common prefixes
    msg = msg.replace(/^Error processing images:\s*/i, '');
    msg = msg.replace(/^Error:\s*/i, '');

    // Truncate if too long
    if (msg.length > 80) {
      return msg.substring(0, 77) + '...';
    }
    return msg;
  }

  toggleErrorDetails(): void {
    this.showFullError = !this.showFullError;
  }

  toggleProcessingLog(): void {
    this.showProcessingLog = !this.showProcessingLog;
  }
}