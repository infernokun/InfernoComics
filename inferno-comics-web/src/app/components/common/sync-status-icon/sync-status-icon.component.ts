// processing-status-icon.component.ts
import { Component, OnInit, OnDestroy, HostListener, ElementRef, ChangeDetectorRef } from '@angular/core';
import { BehaviorSubject, interval, Subscription } from 'rxjs';
import { SeriesService } from '../../../services/series.service';
import { ProgressData, ProgressState } from '../../../models/progress-data.model';

export interface ProcessingStatus {
  items: ProgressData[];
  totalActive: number;
  totalProcessing: number;
  totalQueued: number;
}

@Component({
  selector: 'app-processing-status-icon',
  templateUrl: 'sync-status-icon.component.html',
  styleUrls: ['sync-status-icon.component.scss'],
  animations: [
  ],
  standalone: false
})
export class ProcessingStatusIconComponent implements OnInit, OnDestroy {
  progressState = ProgressState;
  maxDisplayItems = 5;
  showOverlay = false;
  isLoading = true;

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
    private elementRef: ElementRef,
    private cdr: ChangeDetectorRef   
  ) {
    this.currentStatus = this.statusSubject.value;
  }

  ngOnInit() {
    this.status$.subscribe(status => this.currentStatus = status);
    this.startPolling();
  }

  ngOnDestroy() {
    if (this.pollingSubscription) {
      this.pollingSubscription.unsubscribe();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    if (this.showOverlay && !this.elementRef.nativeElement.contains(event.target)) {
      this.showOverlay = false;
    }
  }

  private startPolling() {
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

  toggleOverlay(event: Event) {
    event.stopPropagation();
    this.showOverlay = !this.showOverlay;

    if (this.showOverlay) {
      setTimeout(() => this.cdr.detectChanges(), 0);
    }
  }
}