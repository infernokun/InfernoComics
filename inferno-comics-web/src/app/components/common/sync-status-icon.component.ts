// processing-status-icon.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, interval, Subscription } from 'rxjs';
import { SeriesService } from '../../services/series.service';
import { ProgressData, ProgressState } from '../../models/progress-data.model';

export interface ProcessingStatus {
  items: ProgressData[];
  totalActive: number; // processing + queued
  totalProcessing: number;
  totalQueued: number;
}

@Component({
  selector: 'app-processing-status-icon',
  template: `
    <button mat-icon-button
            [matTooltip]="getTooltipText()"
            matTooltipPosition="below"
            [matTooltipShowDelay]="500"
            [class]="getButtonClass()"
            [disabled]="false">
      <mat-icon [class]="getIconClass()">{{ getIconName() }}</mat-icon>
      
      <!-- Badge showing number of active items -->
      <span *ngIf="currentStatus.totalActive > 0" class="item-count-badge">
        {{ currentStatus.totalActive }}
      </span>
    </button>
  `,
  styles: [`
    :host {
      position: relative;
    }
    
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
    }
    
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
  standalone: false
})
export class ProcessingStatusIconComponent implements OnInit, OnDestroy {
  private statusSubject = new BehaviorSubject<ProcessingStatus>({
    items: [],
    totalActive: 0,
    totalProcessing: 0,
    totalQueued: 0
  });

  public status$ = this.statusSubject.asObservable();
  currentStatus: ProcessingStatus;
  private pollingSubscription?: Subscription;

  constructor(private seriesService: SeriesService) {
    this.currentStatus = this.statusSubject.value;
  }

  ngOnInit() {
    // Subscribe to status changes
    this.status$.subscribe(status => this.currentStatus = status);
    
    // Start polling for status updates every 3 seconds
    this.startPolling();
    
    // Get initial status
    this.fetchStatus();
  }

  ngOnDestroy() {
    if (this.pollingSubscription) {
      this.pollingSubscription.unsubscribe();
    }
  }

  private startPolling() {
    this.pollingSubscription = interval(3000).subscribe(() => {
      this.fetchStatus();
    });
  }

  private fetchStatus() {
    this.seriesService.getRelProgressData().subscribe({
      next: (data: ProgressData[]) => {
        // Convert ProgressData[] to ProcessingStatus
        const processedData = data.map(item => new ProgressData(item));
        const status = this.convertToProcessingStatus(processedData);
        this.statusSubject.next(status);
      },
      error: (error) => {
        console.error('Error fetching processing status:', error);
        // Keep current status on error
      }
    });
  }

  /**
   * Convert ProgressData array to ProcessingStatus
   */
  private convertToProcessingStatus(progressDataArray: ProgressData[]): ProcessingStatus {
    // Count totals based on ProgressData states
    const totalProcessing = progressDataArray.filter(item => item.state === ProgressState.PROCESSING).length;
    const totalQueued = 0; // ProgressData doesn't have queued state, so this is 0
    const totalActive = totalProcessing; // Only processing items are "active"

    return {
      items: progressDataArray,
      totalActive,
      totalProcessing,
      totalQueued
    };
  }

  getButtonClass(): string {
    return this.currentStatus.totalActive > 0 ? 'processing-active' : 'processing-idle';
  }

  getIconClass(): string {
    return this.currentStatus.totalProcessing > 0 ? 'icon-spinning' : '';
  }

  getIconName(): string {
    if (this.currentStatus.totalActive === 0) {
      return 'hourglass_empty'; // No activity
    }
    
    if (this.currentStatus.totalProcessing > 0) {
      return 'autorenew'; // Active processing
    }
    
    return 'schedule'; // Only queued items
  }

  /**
   * Sort items by priority: Processing first, then by most recent time
   */
  private sortItemsByPriority(items: ProgressData[]): ProgressData[] {
    return items.sort((a, b) => {
      // Priority 1: Processing items come first
      if (a.state === ProgressState.PROCESSING && b.state !== ProgressState.PROCESSING) {
        return -1;
      }
      if (b.state === ProgressState.PROCESSING && a.state !== ProgressState.PROCESSING) {
        return 1;
      }
      
      // Priority 2: For items of same state, sort by most recent activity
      // Use lastUpdated for processing items, timeFinished for completed/failed, timeStarted as fallback
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
      
      // Most recent first
      return timeB.getTime() - timeA.getTime();
    });
  }

  getTooltipText(): string {
    if (this.currentStatus.totalActive === 0 && this.currentStatus.items.length === 0) {
      return 'No recent processing activity';
    }

    const lines: string[] = [];
    
    // Sort items by priority (processing first, then by most recent)
    const sortedItems = this.sortItemsByPriority([...this.currentStatus.items]);
    
    // Summary line - show processing count and total recent items
    if (this.currentStatus.totalProcessing > 0) {
      lines.push(`Processing: ${this.currentStatus.totalProcessing} | Recent: ${this.currentStatus.items.length}`);
    } else {
      lines.push(`Recent Activity: ${this.currentStatus.items.length} items`);
    }
    
    // Show items in priority order
    const itemsToShow = sortedItems.slice(0, 5); // Show max 5 items
    
    if (itemsToShow.length > 0) {
      lines.push(''); // Empty line
      
      itemsToShow.forEach(item => {
        let icon = '';
        let timeInfo = '';
        
        switch (item.state) {
          case ProgressState.PROCESSING:
            icon = '🔄';
            const progress = item.percentageComplete ? ` (${item.percentageComplete}%)` : '';
            const elapsed = item.getFormattedDuration();
            timeInfo = `${progress} - ${elapsed}`;
            break;
            
          case ProgressState.COMPLETE:
            icon = '✅';
            timeInfo = `Completed - ${item.getFormattedDuration()}`;
            break;
            
          case ProgressState.ERROR:
            icon = '❌';
            timeInfo = `Failed - ${item.getFormattedDuration()}`;
            break;
            
          default:
            icon = '⏳';
            timeInfo = 'Queued';
        }
        
        const displayName = item.getDisplayName();
        lines.push(`${icon} ${displayName}`);
        
        // Add time info on second line for better readability
        if (timeInfo) {
          lines.push(`    ${timeInfo}`);
        }
      });
      
      // Show "and X more" if there are more items
      if (sortedItems.length > 5) {
        lines.push(`    ... and ${sortedItems.length - 5} more`);
      }
    }
    
    return lines.join('\n');
  }
}