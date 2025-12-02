import { Component, OnInit, OnDestroy, HostListener, ElementRef } from '@angular/core';
import { BehaviorSubject, finalize, interval, Subscription } from 'rxjs';
import { ProgressData, ProgressState } from '../../../models/progress-data.model';
import { trigger, transition, style, animate } from '@angular/animations';
import { MatSnackBar } from '@angular/material/snack-bar';
import { WebSocketResponseList, WebsocketService } from '../../../services/websocket/websocket.service';
import { SeriesService } from '../../../services/series/series.service';

export interface ProcessingStatus {
  items: ProgressData[];
  totalActive: number;
  totalProcessing: number;
  totalQueued: number;
}

@Component({
  selector: 'app-processing-status-icon',
  templateUrl: 'processing-status-icon.component.html',
  styleUrls: ['processing-status-icon.component.scss'],
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-10px)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('150ms ease-in', style({ opacity: 0, transform: 'translateY(-10px)' }))
      ])
    ]),
    trigger('fadeOut', [
      transition(':enter', []),
      transition(':leave', [
        style({ opacity: 1, height: '*', marginBottom: '*', padding: '*', overflow: 'hidden' }),
        animate('200ms ease-out', style({ opacity: 0, height: 0, marginBottom: 0, padding: 0 }))
      ])
    ])
  ],
  standalone: false
})
export class ProcessingStatusIconComponent implements OnInit, OnDestroy {
  private pollingSubscription?: Subscription;
  private wsSub!: Subscription;
  private statusSubject = new BehaviorSubject<ProcessingStatus>({
    items: [],
    totalActive: 0,
    totalProcessing: 0,
    totalQueued: 0
  });

  isLoading = true;
  maxDisplayItems = 5;
  showOverlay = false;
  progressState = ProgressState;
  currentStatus: ProcessingStatus;
  pendingDismissIds = new Set<number>();

  public status$ = this.statusSubject.asObservable();

  constructor(
    private websocket: WebsocketService,
    private seriesService: SeriesService,
    private elementRef: ElementRef,
    private snackBar: MatSnackBar
  ) {
    this.currentStatus = this.statusSubject.value;
  }

  ngOnInit() {
    this.status$.subscribe(status => this.currentStatus = status);
    //this.startPolling();
    this.fetchStatus();

    this.wsSub = this.websocket.messages$.subscribe((msg: any) => {
      this.isLoading = true;
      const response: WebSocketResponseList = msg as WebSocketResponseList;
      if (response.name == 'ProgressDataListRelevance') {
        const processed: ProgressData[] = response.payload.map((item) => new ProgressData(item));
        const status: ProcessingStatus = this.convertToProcessingStatus(processed);
        this.statusSubject.next(status);
        this.isLoading = false;
      }
    });
  }

  ngOnDestroy() {
    if (this.pollingSubscription) {
      this.pollingSubscription.unsubscribe();
    }

    if (this.wsSub) {
      this.wsSub.unsubscribe();
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
    const toDate = (value: any): Date | undefined =>
      value instanceof Date ? value : value ? new Date(value) : undefined;
  
    return [...this.currentStatus.items]
      .sort((a, b) => {
        // 1️⃣  Processing items first
        if (a.state === ProgressState.PROCESSING && b.state !== ProgressState.PROCESSING) {
          return -1;
        }
        if (b.state === ProgressState.PROCESSING && a.state !== ProgressState.PROCESSING) {
          return 1;
        }
  
        // 2️⃣  Get the most recent timestamp for each item
        const getRelevantTime = (item: ProgressData): Date | undefined => {
          if (item.state === ProgressState.PROCESSING && item.lastUpdated) {
            return toDate(item.lastUpdated);
          }
          if (
            (item.state === ProgressState.COMPLETE || item.state === ProgressState.ERROR) &&
            item.timeFinished
          ) {
            return toDate(item.timeFinished);
          }
          return toDate(item.timeStarted);
        };
  
        const timeA = getRelevantTime(a);
        const timeB = getRelevantTime(b);
  
        // 3️⃣  Handle missing dates
        if (!timeA && !timeB) return 0;
        if (!timeA) return 1;
        if (!timeB) return -1;
  
        // 4️⃣  Compare timestamps
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

    if (item.timeStarted) {
      info.push(`Started: ${this.formatDateTime(item.timeStarted)}`);
    }

    if (item.timeFinished) {
      info.push(`Finished: ${this.formatDateTime(item.timeFinished)}`);
    }

    return info.join(' • ');
  }

  // New helper methods for series and user display
  getSeriesDisplay(item: ProgressData): string {
    return item.series?.name || 'Unknown Series';
  }

  getSeriesId(item: ProgressData): string | number {
    return item.series?.id ?? '—';
  }

  getUserDisplay(item: ProgressData): string {
    return item.startedBy || 'System';
  }

  getSeriesInfo(item: ProgressData): string {
    if (!item.series) return 'Unknown Series';
    return `${item.series.name} (ID: ${item.series.id})`;
  }

  private formatDateTime(date: Date): string {
    return date.toLocaleString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  }

  toggleOverlay(event: Event) {
    event.stopPropagation();
    this.showOverlay = !this.showOverlay;
  }

  dismissProgressData(itemId: number): void {
    if (!itemId || this.pendingDismissIds.has(itemId)) return;

    this.pendingDismissIds.add(itemId);

    this.seriesService.dismissProgressData(itemId).pipe(
      finalize(() => this.pendingDismissIds.delete(itemId))
    ).subscribe({
      next: (data: ProgressData[]) => {
        // 4️⃣  Push the new status
        this.statusSubject.next(this.convertToProcessingStatus(data.map(item => new ProgressData(item))));

        // 5️⃣  Show a success snackbar
        this.snackBar.open(
          `Progress for series "${itemId}" dismissed`,
          'Close',
          { duration: 3000, panelClass: ['snackbar-success'] }
        );
      },
      error: err => {
        console.error('Error dismissing progress:', err);
        this.snackBar.open(
          'Failed to dismiss progress',
          'Close',
          { duration: 3000, panelClass: ['snackbar-error'] }
        );
      }
    });
  }
}