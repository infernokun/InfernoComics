import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  signal,
  WritableSignal,
} from '@angular/core';
import {
  GridOptions,
  ColDef,
  GridApi,
  GridReadyEvent,
  FirstDataRenderedEvent,
} from 'ag-grid-community';
import { AdminActionsComponent } from '../../../admin/admin-actions.component';
import { SeriesService } from '../../../services/series.service';
import { CommonModule } from '@angular/common';
import { AgGridModule, ICellRendererAngularComp } from 'ag-grid-angular';
import { MaterialModule } from '../../../material.module';
import { ComicMatch } from '../../../models/comic-match.model';
import { EnvironmentService } from '../../../services/environment.service';
import { HttpClient } from '@angular/common/http';
import { Subscription, interval } from 'rxjs';

@Component({
  selector: 'app-progress-data-table',
  template: `
    <div class="grid-container">
      <div class="grid-header">
        <h2 class="grid-title">Progress Data</h2>
        <button class="refresh-button" (click)="refreshData()">
          🔄 Refresh
        </button>
      </div>
      <div class="grid-wrapper ag-theme-quartz">
        <ag-grid-angular
          style="width: 100%; height: 100%;"
          class="grid-content"
          [gridOptions]="gridOptions"
          [rowData]="progressData()"
          [defaultColDef]="defaultColDef"
        >
        </ag-grid-angular>
      </div>
    </div>
  `,
  styles: [`
    .grid-container {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      height: 700px;
      border: 1px solid #d0d0d0;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      background: #fff;
    }
    
    .grid-header {
      padding: 0.5rem 1rem;
      background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
      border-bottom: 1px solid #e0e0e0;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .grid-title {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
      color: #495057;
    }
    
    .refresh-button {
      background: #007bff;
      color: white;
      border: none;
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.875rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .refresh-button:hover {
      background: #0056b3;
    }
    
    .grid-wrapper {
      flex: 1;
      overflow: hidden;
    }
    
    .ag-theme-quartz {
      height: 100%;
    }
    
    /* Custom AG-Grid styles for taller rows */
    .ag-theme-quartz .ag-header-cell-label {
      font-weight: 600;
    }
    
    .ag-theme-quartz .ag-row {
      border-bottom: 1px solid #f1f3f4;
    }
    
    .ag-theme-quartz .ag-row:hover {
      background-color: #f8f9fa;
    }
    
    /* Center content vertically in taller cells */
    .ag-theme-quartz .ag-cell {
      display: flex;
      align-items: center;
      padding: 8px 12px;
    }
    
    /* Progress bar styles */
    .progress-bar {
      width: 100%;
      height: 20px;
      background-color: #e9ecef;
      border-radius: 10px;
      overflow: hidden;
      position: relative;
    }
    
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #28a745 0%, #20c997 100%);
      border-radius: 10px;
      transition: width 0.3s ease;
      position: relative;
    }
    
    .progress-text {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 11px;
      font-weight: 600;
      color: #fff;
      text-shadow: 0 1px 2px rgba(0,0,0,0.3);
      z-index: 2;
    }
    
    .progress-processing .progress-fill {
      animation: progress-pulse 2s infinite;
    }
    
    @keyframes progress-pulse {
      0% { opacity: 0.6; }
      50% { opacity: 1; }
      100% { opacity: 0.6; }
    }
    
    .status-message {
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.85em;
      color: #6c757d;
    }
  `,
  ],
  imports: [CommonModule, MaterialModule, AgGridModule],
})
export class ProgressDataTable implements OnInit, OnDestroy  {
  @Input() id!: number;
  @Output() resultEmitter: EventEmitter<any> = new EventEmitter<any>(undefined);

  progressData: WritableSignal<any[]> = signal<any[]>([]);

  gridApi?: GridApi;
  gridOptions: GridOptions;
  defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    floatingFilter: true,
    resizable: true,
    suppressSizeToFit: false,
    filterParams: { buttons: ['clear', 'reset'], debounceMs: 200 },
  };

  private refreshSubscription?: Subscription;
  private readonly REFRESH_INTERVAL_MS = 30000; // 30 seconds

  constructor(private seriesService: SeriesService, private environmentService: EnvironmentService) {
    this.gridOptions = {
      animateRows: false,
      cellFlashDuration: 0,
      suppressColumnVirtualisation: false,
      suppressRowVirtualisation: false,
      suppressDragLeaveHidesColumns: true,
      suppressMovableColumns: false,
      pagination: false,
      rowHeight: 80,
      headerHeight: 40,
      columnDefs: this.getColumnDefs(),
      onGridReady: (params) => this.onGridReady(params),
      onFirstDataRendered: (params) => this.onFirstDataRendered(params),
    };
  }

  ngOnInit(): void {
    this.loadProgressData();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
  }

  private loadProgressData(): void {
    this.seriesService.getProgressData(this.id).subscribe({
      next: (res) => {
        this.progressData.set(res);
        if (this.gridApi) {
          console.log('Updating grid with progress data:', this.progressData());
          this.gridApi.setGridOption('rowData', this.progressData());
          this.gridApi.refreshCells();
          
          setTimeout(() => {
            this.gridApi?.sizeColumnsToFit();
          }, 100);
        }
      },
      error: (error) => {
        console.error('Failed to load progress data:', error);
        // Could add user notification here
      }
    });
  }

  private startAutoRefresh(): void {
    this.refreshSubscription = interval(this.REFRESH_INTERVAL_MS).subscribe(() => {
      // Only refresh if there are processing sessions
      const hasProcessingSessions = this.progressData().some(item => item.state === 'PROCESSING');
      if (hasProcessingSessions) {
        console.log('Auto-refreshing progress data...');
        this.loadProgressData();
      }
    });
  }

  private stopAutoRefresh(): void {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
      this.refreshSubscription = undefined;
    }
  }

  refreshData(): void {
    this.loadProgressData();
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    const data = this.progressData();
    if (data && data.length > 0) {
      this.gridApi.setGridOption('rowData', data);
    }
    params.api.sizeColumnsToFit();
  }

  onFirstDataRendered(params: FirstDataRenderedEvent): void {
    params.api.sizeColumnsToFit();
  }

  getColumnDefs(): ColDef[] {
    return [
      {
        //headerName: 'Actions',
        width: 50,
        minWidth: 45,
        maxWidth: 60,
        pinned: 'left',
        sortable: false,
        filter: false,
        resizable: false,
        lockPosition: true,
        cellRenderer: AdminActionsComponent,
        cellRendererParams: (params: any) => {
          if (!params.data) {
            return {
              showPlay: false,
              showAdd: false,
              playClick: () => {},
              addClick: () => {},
            };
          }
          
          const state = params.data.state;
          return {
            showPlay: state === 'COMPLETE' && state !== 'PROCESSING',
            showAdd: state === 'COMPLETE',
            playClick: (data: any) => console.log('playClick', state),
            addClick: (data: any) => this.getSessionJSON(data.sessionId),
          };
        },
      },
      {
        headerName: 'Session ID',
        field: 'sessionId',
        filter: 'agNumberColumnFilter',
        minWidth: 320,
        maxWidth: 330,
      },
      {
        headerName: 'Status & Progress',
        field: 'state',
        cellRenderer: CombinedStatusRenderer,
        filter: 'agTextColumnFilter',
        width: 450,
        maxWidth: 450,
        sortable: true,
        cellStyle: {
          padding: '8px',
          lineHeight: '1.2'
        }
      },
      {
        headerName: 'Total',
        field: 'processedItems',
        filter: 'agTextColumnFilter',
        minWidth: 60,
        maxWidth: 70,
      },
      {
        headerName: 'Timing Info',
        field: 'timeStarted', // Use timeStarted for sorting
        cellRenderer: TimeInfoCellRenderer,
        filter: 'agTextColumnFilter',
        minWidth: 160,
        maxWidth: 160,
        sort: 'desc',
        sortIndex: 0,
        sortable: true,
        cellStyle: {
          padding: '4px 8px',
          lineHeight: '1.2'
        }
      },
      {
        headerName: 'Link',
        field: 'sessionId',
        cellRenderer: EvaluationLinkCellRenderer,
        minWidth: 100,
        maxWidth: 120,
        tooltipField: 'sessionId',
      }
    ];
  }

  // FIXED: Added error handling
  getSessionJSON(sessionId: string) {
    this.seriesService.getSessionJSON(sessionId).subscribe({
      next: (res) => {
        const transformedData = this.transformSessionDataToMatches(res);
        console.log('Transformed session data:', transformedData);
        this.resultEmitter.emit(transformedData);
      },
      error: (error) => {
        console.error('Failed to get session JSON:', error);
        // Could add user notification here
      }
    });
  }

  private transformSessionDataToMatches(sessionData: any): any {
    if (!sessionData?.results || !Array.isArray(sessionData.results)) {
      console.warn('No valid results found in session data');
      return null;
    }

    console.log('🔄 Transforming session data:', sessionData);

    const allMatches: ComicMatch[] = [];
    const storedImages: any[] = [];
    
    sessionData.results.forEach((imageResult: any, imageIndex: number) => {
      console.log(`Processing image result ${imageIndex}:`, imageResult.image_name);
      
      // Store image information for bulk component
      if (imageResult.image_name && imageResult.image_url) {
        storedImages.push({
          index: imageIndex,
          name: imageResult.image_name,
          originalUrl: imageResult.image_url, 
          javaUrl: this.convertToJavaImageUrl(sessionData.session_id, imageResult.image_url)
        });
      }
      
      if (imageResult.matches && Array.isArray(imageResult.matches)) {
        console.log(`Found ${imageResult.matches.length} matches for image ${imageIndex}`);
        
        imageResult.matches.forEach((match: any) => {
          const transformedMatch: ComicMatch = {
            session_id: sessionData.session_id,
            similarity: match.similarity,
            url: match.url,
            local_url: match.local_url,
            meets_threshold: match.meets_threshold,
            comic_name: match.comic_name,
            issue_number: match.issue_number,
            comic_vine_id: match.comic_vine_id,
            parent_comic_vine_id: match.parent_comic_vine_id,
            match_details: match.match_details,
            candidate_features: match.candidate_features,
            sourceImageIndex: match.source_image_index !== undefined 
              ? match.source_image_index 
              : imageIndex,
            sourceImageName: match.source_image_name 
              || imageResult.image_name 
              || `Image ${imageIndex + 1}`
          };
          
          allMatches.push(transformedMatch);
        });
      } else {
        console.log(`No matches found for image ${imageIndex}`);
      }
    });

    console.log(`📊 Total transformed matches: ${allMatches.length}`);
    console.log(`🖼️ Stored images: ${storedImages.length}`);

    return {
      action: 'open_match_dialog',
      matches: allMatches,
      sessionId: sessionData.session_id,
      isMultiple: sessionData.total_images > 1,
      storedImages: storedImages, 
      summary: {
        total_images: sessionData.total_images,
        processed: sessionData.processed,
        successful_matches: sessionData.successful_matches,
        failed_uploads: sessionData.failed_uploads,
        no_matches: sessionData.no_matches,
        best_similarity: sessionData.best_similarity
      }
    };
  }

  // Helper method to convert Python image URL to Java backend URL
  private convertToJavaImageUrl(sessionId: string, pythonImageUrl: string): string {
    // Extract filename from Python URL
    // Python URL: "/inferno-comics-recognition/api/v1/stored_images/session_id/filename.jpg"
    const urlParts = pythonImageUrl.split('/');
    const filename = urlParts[urlParts.length - 1];
    
    // Convert to Java backend URL
    // Java URL: "http://rest-url:8080/inferno-comics-rest/api/progress/image/session_id/filename.jpg"
    return `${this.environmentService.settings?.restUrl}/progress/image/${sessionId}/${filename}`;
  }
}

@Component({
  template: `
  @if (params?.data?.state === "COMPLETE") {
    <a (click)="openEvaluationUrl()" style="cursor: pointer; color: blue; text-decoration: underline;">
      Evaluation
    </a>
  }
  `
})
export class EvaluationLinkCellRenderer implements ICellRendererAngularComp {
  params: any;

  constructor(private httpClient: HttpClient, private environmentService: EnvironmentService) {}

  agInit(params: any): void {
    this.params = params;
  }

  refresh(): boolean {
    return false;
  }

  async openEvaluationUrl() {
    if (!this.params?.value) {
      console.error('No session ID available');
      return;
    }

    const sessionId = this.params.value;
    try {
      const response = await this.httpClient.get<{ evaluationUrl: string }>(
        `${this.environmentService.settings?.restUrl}/progress/evaluation/${sessionId}`
      ).toPromise();

      if (!response?.evaluationUrl) {
        console.error('No evaluation URL received from server');
        return;
      }

      const evaluationUrl = new URL(response.evaluationUrl);
      
      evaluationUrl.hostname = window.location.hostname;
      
      if (this.environmentService.settings?.production) {
        if (window.location.port) {
          evaluationUrl.port = window.location.port;
        } else {
          evaluationUrl.port = '';
        }
      }

      const finalUrl = evaluationUrl.toString();
      console.log('Opening evaluation URL:', finalUrl);
      
      window.open(finalUrl, '_blank', 'noopener,noreferrer');
      
    } catch (error) {
      console.error('Error fetching evaluation URL:', error);
    }
  }
}

@Component({
  selector: 'app-time-info-renderer',
  template: `
    <div class="time-info-container">
      <div class="time-row started">
        <span class="time-label">Started:</span>
        <span class="time-value">{{ formatTime(params?.data?.timeStarted) }}</span>
      </div>
      <div class="time-row finished" *ngIf="params?.data?.timeFinished">
        <span class="time-label">Finished:</span>
        <span class="time-value">{{ formatTime(params?.data?.timeFinished) }}</span>
      </div>
      <div class="time-row duration" *ngIf="getDuration()">
        <span class="time-label">Duration:</span>
        <span class="time-value duration-text">{{ getDuration() }}</span>
      </div>
      <div class="time-row processing" *ngIf="!params?.data?.timeFinished">
        <span class="time-value processing-text">{{ getProcessingStatus() }}</span>
      </div>
    </div>
  `,
  styles: [`
    .time-info-container {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 4px 0;
      font-size: 0.8em;
      line-height: 1.2;
    }
    
    .time-row {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    
    .time-label {
      font-weight: 500;
      color: #6c757d;
      min-width: 50px;
      font-size: 0.85em;
    }
    
    .time-value {
      color: #495057;
      font-weight: 400;
    }
    
    .duration-text {
      color: #007bff;
      font-weight: 600;
    }
    
    .processing-text {
      color: #ffc107;
      font-style: italic;
      font-weight: 500;
    }
    
    .started .time-value {
      color: #28a745;
    }
    
    .finished .time-value {
      color: #17a2b8;
    }
  `],
  imports: [CommonModule]
})
export class TimeInfoCellRenderer implements ICellRendererAngularComp {
  params: any;

  agInit(params: any): void {
    this.params = params;
  }

  refresh(): boolean {
    return false;
  }

  formatTime(timeString: string): string {
    if (!timeString) return 'N/A';
    
    try {
      const date = new Date(timeString);
      if (isNaN(date.getTime())) {
        return 'Invalid';
      }
      
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      console.error('Error formatting time:', error);
      return 'Invalid';
    }
  }

  getDuration(): string {
    const timeStarted = this.params?.data?.timeStarted;
    const timeFinished = this.params?.data?.timeFinished;
    
    if (!timeStarted || !timeFinished) {
      return '';
    }
    
    try {
      const startTime = new Date(timeStarted);
      const endTime = new Date(timeFinished);
      
      if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
        return 'Invalid';
      }
      
      const diffMs = endTime.getTime() - startTime.getTime();
      
      if (diffMs < 0) return 'Invalid';
      
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
      
      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      } else if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
      } else {
        return `${seconds}s`;
      }
    } catch (error) {
      console.error('Error calculating duration:', error);
      return 'Error';
    }
  }

  getProcessingStatus(): string {
    const state = this.params?.data?.state;
    if (state === 'PROCESSING') {
      return 'Currently processing...';
    } else if (state === 'ERROR') {
      return 'Failed to complete';
    } else {
      return 'Not finished';
    }
  }
}

@Component({
  selector: 'app-combined-status-renderer',
  template: `
    <div class="combined-status-container">
      <!-- Main status with icon -->
      <div class="main-status">
        <span class="status-icon" [style.color]="getStatusColor()">{{ getStatusIcon() }}</span>
        <span class="status-text" [style.color]="getStatusColor()">{{ getMainStatusText() }}</span>
        <span> {{params?.data?.startedBy}} <span *ngIf="params.data.state == 'COMPLETE'"> - <button mat-button class="replay-button" (click)="replaySession()">REPLAY</button></span></span>
      </div>
      
      <!-- Progress bar for processing items -->
      <div class="progress-section" *ngIf="shouldShowProgress()">
        <div class="progress-bar" [class.progress-processing]="isProcessing()">
          <div class="progress-fill" [style.width.%]="getPercentage()"></div>
          <div class="progress-text">{{ getPercentage() }}%</div>
        </div>
      </div>
      
      <!-- Status message (smaller font) -->
      <div class="status-message" *ngIf="params?.data?.statusMessage">
        {{ params.data.statusMessage }}
      </div>
    </div>
  `,
  styles: [`
    .combined-status-container {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 4px 0;
      min-height: 40px;
      justify-content: center;
    }
    
    .main-status {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      font-size: 0.9em;
    }
    
    .status-icon {
      font-size: 1.1em;
    }
    
    .status-text {
      font-weight: 600;
    }
    
    .progress-section {
      margin: 2px 0;
    }
    
    .progress-bar {
      width: 100%;
      height: 16px;
      background-color: #e9ecef;
      border-radius: 8px;
      overflow: hidden;
      position: relative;
    }
    
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #28a745 0%, #20c997 100%);
      border-radius: 8px;
      transition: width 0.3s ease;
      position: relative;
    }
    
    .progress-text {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 10px;
      font-weight: 600;
      color: #fff;
      text-shadow: 0 1px 2px rgba(0,0,0,0.3);
      z-index: 2;
    }
    
    .progress-processing .progress-fill {
      animation: progress-pulse 2s infinite;
    }
    
    @keyframes progress-pulse {
      0% { opacity: 0.6; }
      50% { opacity: 1; }
      100% { opacity: 0.6; }
    }
    
    .status-message {
      font-size: 0.75em;
      color: #6c757d;
      font-style: italic;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      line-height: 1.2;
    }

    .replay-button {
      background: #007bff;
      color: white;
      border: none;
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.875rem;
      align-items: center;
      gap: 0.5rem;
    }
    
    .replay-button:hover {
      background: #0056b3;
    }
  `],
  imports: [CommonModule]
})
export class CombinedStatusRenderer implements ICellRendererAngularComp {
  params: any;

  constructor(private seriesService: SeriesService) {}

  agInit(params: any): void {
    this.params = params;
  }

  refresh(): boolean {
    return false;
  }

  getStatusIcon(): string {
    const state = this.params?.data?.state;
    const icons: Record<string, string> = {
      'COMPLETE': '✅',
      'PROCESSING': '⏳',
      'ERROR': '❌',
      'PENDING': '⏸️',
      'QUEUED': '⏳',
    };
    return icons[state] || '❓';
  }

  getStatusColor(): string {
    const state = this.params?.data?.state;
    const colors: Record<string, string> = {
      'COMPLETE': '#28a745',
      'PROCESSING': '#ffc107',
      'ERROR': '#dc3545',
      'PENDING': '#6c757d',
      'QUEUED': '#17a2b8',
    };
    return colors[state] || '#6c757d';
  }

  getMainStatusText(): string {
    const state = this.params?.data?.state;
    
    switch (state) {
      case 'COMPLETE':
        return 'Complete';
      case 'PROCESSING':
        return 'Processing';
      case 'ERROR':
        return 'Failed';
      case 'PENDING':
        return 'Pending';
      case 'QUEUED':
        return 'Queued';
      default:
        return state || 'Unknown';
    }
  }

  replaySession() {
    const sessionId = this.params?.data.sessionId;

    this.seriesService.replaySession(sessionId).subscribe((data: any) => {

    });
  }

  shouldShowProgress(): boolean {
    const state = this.params?.data?.state;
    const percentage = this.getPercentage();
    
    // Show progress bar if processing or if we have meaningful progress data (but not complete)
    return state === 'PROCESSING' || (percentage > 0 && percentage < 100 && state !== 'COMPLETE');
  }

  isProcessing(): boolean {
    return this.params?.data?.state === 'PROCESSING';
  }

  getPercentage(): number {
    return this.params?.data?.percentageComplete || 0;
  }
}