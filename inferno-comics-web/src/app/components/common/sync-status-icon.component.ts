// processing-status-icon.component.ts
import { Component, OnInit, OnDestroy, HostListener, ElementRef } from '@angular/core';
import { BehaviorSubject, interval, Subscription } from 'rxjs';
import { SeriesService } from '../../services/series.service';
import { ProgressData, ProgressState } from '../../models/progress-data.model';

export interface ProcessingStatus {
  items: ProgressData[];
  totalActive: number;
  totalProcessing: number;
  totalQueued: number;
}

@Component({
  selector: 'app-processing-status-icon',
  template: `
    <div class="processing-status-container">
      
      <button mat-icon-button
              [class]="getButtonClass()"
              [disabled]="false"
              (click)="toggleOverlay($event)">
        <mat-icon [class]="getIconClass()">{{ getIconName() }}</mat-icon>
        
        <!-- Badge showing number of active items -->
        <span *ngIf="currentStatus.totalActive > 0" class="item-count-badge">
          {{ currentStatus.totalActive }}
        </span>
      </button>

      <!-- Enhanced Overlay Panel -->
      <div *ngIf="showOverlay" 
           class="processing-overlay"
           [@slideIn]>
        
        <!-- Header -->
        <div class="overlay-header">
          <div class="header-title">
            <mat-icon class="header-icon">{{ getIconName() }}</mat-icon>
            <span>Processing Status</span>
          </div>
          <div class="header-summary">
            <span *ngIf="currentStatus.totalProcessing > 0" class="processing-count">
              {{ currentStatus.totalProcessing }} Processing
            </span>
            <span *ngIf="currentStatus.totalQueued > 0" class="queued-count">
              {{ currentStatus.totalQueued }} Queued
            </span>
            <span *ngIf="currentStatus.totalActive === 0" class="idle-text">
              No active tasks
            </span>
          </div>
        </div>

        <!-- Content -->
        <div class="overlay-content">
          <!-- Loading Skeleton - Always show when loading, regardless of data -->
          <div *ngIf="isLoading" class="skeleton-container">
            <div *ngFor="let item of [1,2,3]" class="skeleton-item">
              <div class="skeleton-header">
                <div class="skeleton-status">
                  <div class="skeleton-icon"></div>
                  <div class="skeleton-text skeleton-status-text"></div>
                  <div class="skeleton-name"></div>
                </div>
                <div class="skeleton-progress-percent"></div>
              </div>
              <div class="skeleton-progress-bar"></div>
              <div class="skeleton-details">
                <div class="skeleton-time"></div>
                <div class="skeleton-eta"></div>
              </div>
            </div>
          </div>

          <!-- Real Content - Only show when NOT loading -->
          <div *ngIf="!isLoading">
            <!-- No Activity State -->
            <div *ngIf="currentStatus.items.length === 0" class="no-activity">
              <mat-icon class="no-activity-icon">hourglass_empty</mat-icon>
              <div class="no-activity-text">No recent processing activity</div>
            </div>

            <!-- Processing Items -->
            <div *ngIf="getSortedItems().length > 0" class="items-container">
              <div *ngFor="let item of getSortedItems(); let i = index" 
                   class="processing-item" 
                   [class]="getItemClass(item)">
                
                <!-- Compact Item Header -->
                <div class="item-header">
                  <div class="item-status">
                    <mat-icon class="status-icon" [class]="getStatusIconClass(item)">
                      {{ getStatusIcon(item) }}
                    </mat-icon>
                    <span class="status-text">{{ getStatusText(item) }}</span>
                    <div class="item-name" [title]="item.getDisplayName()">
                      {{ item.getDisplayName() }}
                    </div>
                  </div>
                  <div class="item-progress" *ngIf="item.percentageComplete !== undefined">
                    {{ item.percentageComplete }}%
                  </div>
                </div>

                <!-- Compact Progress Bar (for processing items) -->
                <div *ngIf="item.state === progressState.PROCESSING && item.percentageComplete !== undefined" 
                     class="progress-container">
                  <mat-progress-bar mode="determinate" 
                                    [value]="item.percentageComplete"
                                    class="progress-bar">
                  </mat-progress-bar>
                </div>

                <!-- Compact Item Details -->
                <div class="item-details">
                  <span class="duration">{{ getItemTimeInfo(item) }}</span>
                  <span *ngIf="item.state === progressState.PROCESSING && getEstimatedTime(item)" 
                        class="estimated-time">
                    • ETA: {{ getEstimatedTime(item) }}
                  </span>
                  <span *ngIf="getItemAdditionalInfo(item)" class="additional-info">
                    • {{ getItemAdditionalInfo(item) }}
                  </span>

                  <!-- Error Message -->
                  <div *ngIf="item.errorMessage && item.state === progressState.ERROR" 
                       class="error-message">
                    {{ item.errorMessage }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Show More Link -->
            <div *ngIf="getSortedItems().length > maxDisplayItems" class="show-more">
              <button mat-button class="show-more-btn">
                View all {{ currentStatus.items.length }} items
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .processing-status-container {
      position: relative;
      display: inline-block;
    }
    
    /* Button Styles */
    .processing-idle {
      color: inherit;
      opacity: 0.6;
    }
    
    .processing-active {
      color: #2196f3;
      animation: pulse 2s infinite;
    }
    
    .icon-spinning {
      animation: spin 2s linear infinite;
    }
    
    .item-count-badge {
      position: absolute;
      top: 4px;
      right: 4px;
      background: #f44336;
      color: white;
      border-radius: 50%;
      font-size: 10px;
      font-weight: bold;
      min-width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      box-sizing: border-box;
      z-index: 10;
    }

    /* Overlay Styles - Positioned directly under the icon, aligned left */
    .processing-overlay {
      position: absolute;
      top: 100%;
      left: 0;
      margin-top: 8px;
      width: 400px;
      max-width: calc(100vw - 16px);
      background: white;
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.08);
      border: 1px solid #e0e0e0;
      z-index: 1000;
      overflow: hidden;
    }

    /* Responsive positioning */
    @media (max-width: 480px) {
      .processing-overlay {
        width: calc(100vw - 16px);
        left: 8px;
        right: 8px;
      }
    }

    /* Header */
    .overlay-header {
      padding: 16px 20px;
      background: #f5f5f5;
      border-bottom: 1px solid #e0e0e0;
    }

    .header-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
      font-size: 16px;
      color: #333;
    }

    .header-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .header-summary {
      display: flex;
      gap: 16px;
      margin-top: 8px;
      font-size: 13px;
    }

    .processing-count {
      color: #2196f3;
      font-weight: 500;
    }

    .queued-count {
      color: #ff9800;
      font-weight: 500;
    }

    .idle-text {
      color: #666;
    }

    /* Content */
    .overlay-content {
      max-height: 400px;
      overflow-y: auto;
    }

    .no-activity {
      padding: 40px 20px;
      text-align: center;
      color: #666;
    }

    .no-activity-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      margin-bottom: 12px;
      opacity: 0.5;
    }

    .no-activity-text {
      font-size: 14px;
    }

    /* Items - More Compact Layout with Smooth Transitions */
    .items-container {
      padding: 4px 0;
    }

    .processing-item {
      padding: 12px 16px;
      border-bottom: 1px solid #f0f0f0;
      transition: all 0.3s ease;
      opacity: 1;
      transform: translateY(0);
    }

    .processing-item:hover {
      background-color: #f9f9f9;
    }

    .processing-item:last-child {
      border-bottom: none;
    }

    .processing-item.priority-processing {
      background-color: #f3f8ff;
      border-left: 3px solid #2196f3;
    }

    .processing-item.priority-queued {
      background-color: #fff8f3;
      border-left: 3px solid #ff9800;
    }

    .processing-item.completed {
      opacity: 0.8;
    }

    .processing-item.error {
      background-color: #fff5f5;
      border-left: 3px solid #f44336;
    }

    /* Smooth transitions for content changes */
    .item-name, .item-progress, .item-details, .progress-container {
      transition: all 0.2s ease;
    }

    /* Compact Item Header */
    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }

    .item-status {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      min-width: 0;
    }

    .status-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }

    .status-icon.processing {
      color: #2196f3;
      animation: spin 2s linear infinite;
    }

    .status-icon.completed {
      color: #4caf50;
    }

    .status-icon.error {
      color: #f44336;
    }

    .status-icon.queued {
      color: #ff9800;
    }

    .status-text {
      font-weight: 500;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      flex-shrink: 0;
    }

    .item-progress {
      font-size: 11px;
      font-weight: 500;
      color: #2196f3;
      padding: 2px 6px;
      background: #e3f2fd;
      border-radius: 10px;
      flex-shrink: 0;
    }

    /* Compact Item Name - Now inline with status */
    .item-name {
      font-size: 13px;
      font-weight: 400;
      color: #333;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      min-width: 0;
      margin-left: 4px;
    }

    /* Compact Progress Bar */
    .progress-container {
      margin-bottom: 6px;
    }

    .progress-bar {
      height: 3px;
      border-radius: 2px;
    }

    /* Compact Item Details - All in one line */
    .item-details {
      font-size: 11px;
      color: #666;
      line-height: 1.3;
    }

    .duration {
      font-weight: 500;
    }

    .estimated-time {
      color: #2196f3;
      font-style: italic;
    }

    .additional-info {
      font-style: italic;
    }

    .error-message {
      color: #f44336;
      font-size: 10px;
      background: #ffebee;
      padding: 3px 6px;
      border-radius: 3px;
      margin-top: 4px;
      display: block;
    }

    /* Skeleton Loading Styles */
    .skeleton-container {
      padding: 4px 0;
    }

    .skeleton-item {
      padding: 12px 16px;
      border-bottom: 1px solid #f0f0f0;
    }

    .skeleton-item:last-child {
      border-bottom: none;
    }

    .skeleton-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }

    .skeleton-status {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
    }

    .skeleton-icon {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #f0f0f0;
      animation: skeleton-pulse 1.5s ease-in-out infinite;
    }

    .skeleton-text {
      background: #f0f0f0;
      border-radius: 4px;
      animation: skeleton-pulse 1.5s ease-in-out infinite;
    }

    .skeleton-status-text {
      width: 60px;
      height: 12px;
    }

    .skeleton-progress-percent {
      width: 30px;
      height: 16px;
      background: #f0f0f0;
      border-radius: 8px;
      animation: skeleton-pulse 1.5s ease-in-out infinite;
    }

    .skeleton-name {
      width: 70%;
      height: 13px;
      background: #f0f0f0;
      border-radius: 4px;
      margin-bottom: 6px;
      margin-left: 22px;
      animation: skeleton-pulse 1.5s ease-in-out infinite;
    }

    .skeleton-progress-bar {
      width: 100%;
      height: 3px;
      background: #f0f0f0;
      border-radius: 2px;
      margin-bottom: 6px;
      animation: skeleton-pulse 1.5s ease-in-out infinite;
    }

    .skeleton-details {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .skeleton-time {
      width: 80px;
      height: 11px;
      background: #f0f0f0;
      border-radius: 4px;
      animation: skeleton-pulse 1.5s ease-in-out infinite;
    }

    .skeleton-eta {
      width: 50px;
      height: 11px;
      background: #f0f0f0;
      border-radius: 4px;
      animation: skeleton-pulse 1.5s ease-in-out infinite;
    }

    @keyframes skeleton-pulse {
      0% {
        opacity: 1;
      }
      50% {
        opacity: 0.4;
      }
      100% {
        opacity: 1;
      }
    }

    /* Show More */
    .show-more {
      padding: 12px 20px;
      border-top: 1px solid #f0f0f0;
      text-align: center;
    }

    .show-more-btn {
      font-size: 12px;
      color: #2196f3;
    }

    /* Animations */
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @keyframes pulse {
      0% { opacity: 1; }
      50% { opacity: 0.7; }
      100% { opacity: 1; }
    }
  `],
  animations: [
    // Add slide-in animation
    // You'll need to import trigger, state, style, transition, animate from @angular/animations
  ],
  standalone: false
})
export class ProcessingStatusIconComponent implements OnInit, OnDestroy {
  progressState = ProgressState; // Make enum available in template
  maxDisplayItems = 5;
  showOverlay = false;
  isLoading = false;

  private statusSubject = new BehaviorSubject<ProcessingStatus>({
    items: [],
    totalActive: 0,
    totalProcessing: 0,
    totalQueued: 0
  });

  public status$ = this.statusSubject.asObservable();
  currentStatus: ProcessingStatus;
  private pollingSubscription?: Subscription;

  constructor(
    private seriesService: SeriesService,
    private elementRef: ElementRef
  ) {
    this.currentStatus = this.statusSubject.value;
    this.isLoading = true; // Start with loading state
  }

  ngOnInit() {
    this.status$.subscribe(status => this.currentStatus = status);
    this.startPolling();
    // Don't call fetchStatus() here since we start with loading state
  }

  ngOnDestroy() {
    if (this.pollingSubscription) {
      this.pollingSubscription.unsubscribe();
    }
  }

  // Listen for clicks outside to close overlay
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    if (this.showOverlay && !this.elementRef.nativeElement.contains(event.target)) {
      this.showOverlay = false;
    }
  }

  private startPolling() {
    // Initial fetch
    this.fetchStatus();
    
    // Then poll every 3 seconds
    this.pollingSubscription = interval(3000).subscribe(() => {
      this.fetchStatusSilently();
    });
  }

  private fetchStatus() {
    this.isLoading = true;
    this.seriesService.getRelProgressData().subscribe({
      next: (data: ProgressData[]) => {
        const processedData = data.map(item => new ProgressData(item));
        const status = this.convertToProcessingStatus(processedData);
        this.statusSubject.next(status);
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error fetching processing status:', error);
        this.isLoading = false;
      }
    });
  }

  // Silent fetch for polling - doesn't show loading skeleton
  private fetchStatusSilently() {
    this.seriesService.getRelProgressData().subscribe({
      next: (data: ProgressData[]) => {
        const processedData = data.map(item => new ProgressData(item));
        const status = this.convertToProcessingStatus(processedData);
        this.statusSubject.next(status);
      },
      error: (error) => {
        console.error('Error fetching processing status:', error);
      }
    });
  }

  private convertToProcessingStatus(progressDataArray: ProgressData[]): ProcessingStatus {
    const totalProcessing = progressDataArray.filter(item => item.state === ProgressState.PROCESSING).length;
    const totalQueued = 0; // Add queued logic when available
    const totalActive = totalProcessing + totalQueued;

    return {
      items: progressDataArray,
      totalActive,
      totalProcessing,
      totalQueued
    };
  }

  // UI Helper Methods
  getButtonClass(): string {
    return this.currentStatus.totalActive > 0 ? 'processing-active' : 'processing-idle';
  }

  getIconClass(): string {
    return this.currentStatus.totalProcessing > 0 ? 'icon-spinning' : '';
  }

  getIconName(): string {
    if (this.currentStatus.totalActive === 0) {
      return 'hourglass_empty';
    }
    if (this.currentStatus.totalProcessing > 0) {
      return 'autorenew';
    }
    return 'schedule';
  }

  getSortedItems(): ProgressData[] {
    return [...this.currentStatus.items]
      .sort((a, b) => {
        // Priority 1: Processing items first
        if (a.state === ProgressState.PROCESSING && b.state !== ProgressState.PROCESSING) {
          return -1;
        }
        if (b.state === ProgressState.PROCESSING && a.state !== ProgressState.PROCESSING) {
          return 1;
        }

        // Priority 2: Queued items next (when implemented)
        
        // Priority 3: Sort by most recent activity
        const getRelevantTime = (item: ProgressData): Date | undefined => {
          if (item.state === ProgressState.PROCESSING && item.lastUpdated) {
            return item.lastUpdated;
          }
          if ((item.state === ProgressState.COMPLETE || item.state === ProgressState.ERROR) && item.timeFinished) {
            return item.timeFinished;
          }
          return item.timeStarted;
        };

        const timeA = getRelevantTime(a);
        const timeB = getRelevantTime(b);

        if (!timeA && !timeB) return 0;
        if (!timeA) return 1;
        if (!timeB) return -1;

        return timeB.getTime() - timeA.getTime();
      })
      .slice(0, this.maxDisplayItems);
  }

  getItemClass(item: ProgressData): string {
    const classes = [];
    
    if (item.state === ProgressState.PROCESSING) {
      classes.push('priority-processing');
    } else if (item.state === ProgressState.COMPLETE) {
      classes.push('completed');
    } else if (item.state === ProgressState.ERROR) {
      classes.push('error');
    }
    
    return classes.join(' ');
  }

  getStatusIcon(item: ProgressData): string {
    switch (item.state) {
      case ProgressState.PROCESSING:
        return 'autorenew';
      case ProgressState.COMPLETE:
        return 'check_circle';
      case ProgressState.ERROR:
        return 'error';
      default:
        return 'schedule';
    }
  }

  getStatusIconClass(item: ProgressData): string {
    switch (item.state) {
      case ProgressState.PROCESSING:
        return 'processing';
      case ProgressState.COMPLETE:
        return 'completed';
      case ProgressState.ERROR:
        return 'error';
      default:
        return 'queued';
    }
  }

  getStatusText(item: ProgressData): string {
    switch (item.state) {
      case ProgressState.PROCESSING:
        return 'Processing';
      case ProgressState.COMPLETE:
        return 'Completed';
      case ProgressState.ERROR:
        return 'Failed';
      default:
        return 'Queued';
    }
  }

  getItemTimeInfo(item: ProgressData): string {
    const duration = item.getFormattedDuration();
    
    if (item.state === ProgressState.PROCESSING) {
      return `Running: ${duration}`;
    } else if (item.state === ProgressState.COMPLETE) {
      return `Completed in ${duration}`;
    } else if (item.state === ProgressState.ERROR) {
      return `Failed after ${duration}`;
    }
    
    return duration;
  }

  getEstimatedTime(item: ProgressData): string | null {
    const eta = item.getEstimatedCompletion();
    if (!eta) return null;
    
    const now = new Date();
    const diffMs = eta.getTime() - now.getTime();
    const diffMinutes = Math.ceil(diffMs / (1000 * 60));
    
    if (diffMinutes <= 0) return 'Soon';
    if (diffMinutes < 60) return `${diffMinutes}m`;
    
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return `${hours}h ${minutes}m`;
  }

  getItemAdditionalInfo(item: ProgressData): string {
    const info = [];
    
    if (item.totalItems && item.processedItems !== undefined) {
      info.push(`${item.processedItems}/${item.totalItems} items`);
    }
    
    if (item.successfulItems !== undefined && item.failedItems !== undefined) {
      info.push(`${item.successfulItems} successful, ${item.failedItems} failed`);
    }
    
    return info.join(' • ');
  }

  // Toggle overlay on click
  toggleOverlay(event: Event) {
    event.stopPropagation(); // Prevent document click handler
    this.showOverlay = !this.showOverlay;
  }


}