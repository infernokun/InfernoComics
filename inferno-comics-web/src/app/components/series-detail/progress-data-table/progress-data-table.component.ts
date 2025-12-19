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
import { AdminActionRendererParams, AdminActionsComponent } from './renderers/admin-actions.renderer';
import { AgGridModule } from 'ag-grid-angular';
import { MaterialModule } from '../../../material.module';
import { ComicMatch } from '../../../models/comic-match.model';
import { ApiResponse } from '../../../models/api-response.model';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subscription, interval } from 'rxjs';
import { ProgressData, State } from '../../../models/progress-data.model';
import { EnvironmentService } from '../../../services/environment.service';
import { ProgressDataService } from '../../../services/progress-data.service';
import { RecognitionService } from '../../../services/recognition.service';
import { SeriesService } from '../../../services/series.service';
import { WebsocketService, WebSocketResponseList } from '../../../services/websocket.service';
import { DateUtils } from '../../../utils/date-utils';
import { ConfirmationDialogData, ConfirmationDialogComponent } from '../../common/dialog/confirmation-dialog/confirmation-dialog.component';
import { CombinedStatusCellRenderer } from './renderers/combined-status-cell.renderer';
import { EvaluationLinkCellRenderer } from './renderers/evaluation-link-cell.renderer';
import { TimeInfoCellRenderer } from './renderers/time-info-cell.renderer';

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
  styles: [
    `
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
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        z-index: 2;
      }

      .progress-processing .progress-fill {
        animation: progress-pulse 2s infinite;
      }

      @keyframes progress-pulse {
        0% {
          opacity: 0.6;
        }
        50% {
          opacity: 1;
        }
        100% {
          opacity: 0.6;
        }
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
  imports: [MaterialModule, AgGridModule],
})
export class ProgressDataTable implements OnInit, OnDestroy {
  @Input() id!: number;
  @Output() resultEmitter: EventEmitter<any> = new EventEmitter<any>(undefined);

  progressData: WritableSignal<any[]> = signal<any[]>([]);

  private wsSub!: Subscription;
  isLoading = true;

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

  constructor(
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private websocket: WebsocketService,
    private seriesService: SeriesService,
    private recognitionService: RecognitionService,
    private environmentService: EnvironmentService,
    private progressDataService: ProgressDataService,
  ) {
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

    this.wsSub = this.websocket.messages$.subscribe((msg: any) => {
      this.isLoading = true;
      const response: WebSocketResponseList = msg as WebSocketResponseList;
      if (response.name == 'ProgressDataListTable' && response.seriesId == this.id) {
        const processed: ProgressData[] = response.payload.map((item) => new ProgressData(item));
        this.progressData.set(processed);
        
        if (this.gridApi) {
          this.gridApi.setGridOption('rowData', this.progressData());
          this.gridApi.refreshCells();
          this.gridApi?.sizeColumnsToFit();
        }

        this.isLoading = false;
        console.log('Received data', processed.forEach((data: ProgressData) => console.log(`percent complete=${data.getProgressPercentage()}%`)));
      }
    });
    //this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
    if (this.wsSub) {
      this.wsSub.unsubscribe();
    }
  }

  private loadProgressData(): void {
    this.progressDataService.getProgressData(this.id).subscribe({
      next: (res: ApiResponse<ProgressData[]>) => {
        if (!res.data) throw new Error('issue getting progress data by id');

        this.progressData.set(res.data.map(data => new ProgressData(data)));
        if (this.gridApi) {
          console.log('Updating grid with progress data:', this.progressData());
          this.gridApi.setGridOption('rowData', this.progressData());
          this.gridApi.refreshCells();

          setTimeout(() => {
            this.gridApi?.sizeColumnsToFit();
          }, 100);
        }
      },
      error: (err: Error) => {
        console.error('Failed to load progress data:', err);
      },
    });
  }

  private startAutoRefresh(): void {
    this.refreshSubscription = interval(this.REFRESH_INTERVAL_MS).subscribe(
      () => {
        // Only refresh if there are processing sessions
        const hasProcessingSessions = this.progressData().some(
          (item) => item.state === State.PROCESSING
        );
        if (hasProcessingSessions) {
          console.log('Auto-refreshing progress data...');
          this.loadProgressData();
        }
      }
    );
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
        cellRendererParams: (params: AdminActionRendererParams) => {
          const progressData: ProgressData = params.data;
          if (!progressData) {
            return {
              showReplay: false,
              showAdd: false,
              playClick: () => {},
              addClick: () => {},
            };
          }

          return {
            showReplay: progressData.state === State.COMPLETED,
            showAdd: progressData.state === State.COMPLETED,
            replayClick: (data: any) => this.replaySession(data),
            addClick: (data: any) => this.getSessionJSON(data.sessionId),
            deleteClick: (data: any) => this.deleteProgressData(data.sessionId),
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
        cellRenderer: CombinedStatusCellRenderer,
        filter: 'agTextColumnFilter',
        width: 450,
        maxWidth: 450,
        sortable: true,
        cellStyle: {
          padding: '8px',
          lineHeight: '1.2',
        },
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
        field: 'timeStarted',
        cellRenderer: TimeInfoCellRenderer,
        filter: 'agTextColumnFilter',
        minWidth: 160,
        maxWidth: 160,
        sort: 'desc',
        sortIndex: 0,
        sortable: true,
        cellStyle: {
          padding: '4px 8px',
          lineHeight: '1.2',
        },
      },
      {
        headerName: 'Link',
        field: 'sessionId',
        cellRenderer: EvaluationLinkCellRenderer,
        minWidth: 100,
        maxWidth: 120,
        tooltipField: 'sessionId',
      },
    ];
  }

  getSessionJSON(sessionId: string) {
    this.recognitionService.getSessionJSON(sessionId).subscribe({
      next: (res: ApiResponse<any>) => {
        const transformedData = this.transformSessionDataToMatches(res.data);
        console.log('Transformed session data:', transformedData);
        this.resultEmitter.emit(transformedData);
      },
      error: (err: Error) => {
        console.error('Failed to get session JSON:', err);
      },
    });
  }

  deleteProgressData(sessionId: string): void {
    this.progressDataService.deleteProgressData(sessionId).subscribe({
      next: () => {
        this.snackBar.open('Progress deleted', 'Close', { duration: 3000 });
  
        this.loadProgressData();
      },
      error: (err: Error) => {
        this.snackBar.open(err.message, 'Close', { duration: 5000 });
      }
    });
  }

  private transformSessionDataToMatches(sessionData: any): any {
    if (!sessionData?.results || !Array.isArray(sessionData.results)) {
      console.warn('No valid results found in session data');
      return null;
    }

    console.log('Transforming session data:', sessionData);

    const allMatches: ComicMatch[] = [];
    const storedImages: any[] = [];

    sessionData.results.forEach((imageResult: any, imageIndex: number) => {
      console.log(
        `Processing image result ${imageIndex}:`,
        imageResult.image_name
      );

      // Store image information for bulk component
      if (imageResult.image_name && imageResult.image_url) {
        storedImages.push({
          index: imageIndex,
          name: imageResult.image_name,
          originalUrl: imageResult.image_url,
          javaUrl: this.convertToJavaImageUrl(
            sessionData.session_id,
            imageResult.image_url
          ),
        });
      }

      if (imageResult.matches && Array.isArray(imageResult.matches)) {
        console.log(
          `Found ${imageResult.matches.length} matches for image ${imageIndex}`
        );

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
            sourceImageIndex:
              match.source_image_index !== undefined
                ? match.source_image_index
                : imageIndex,
            sourceImageName:
              match.source_image_name ||
              imageResult.image_name ||
              `Image ${imageIndex + 1}`,
          };

          allMatches.push(transformedMatch);
        });
      } else {
        console.log(`No matches found for image ${imageIndex}`);
      }
    });

    console.log(`Total transformed matches: ${allMatches.length}`);
    console.log(`Stored images: ${storedImages.length}`);

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
        best_similarity: sessionData.best_similarity,
      },
    };
  }

  replaySession(progressData: ProgressData) {
    if (!progressData.sessionId) return;

    const confirm: ConfirmationDialogData = {
      title: `Replay Session: ${progressData.series?.name}`,
      message: `
      <div style="text-align: left;">
        <p><strong>Series:</strong> ${progressData.series?.name || 'Unknown'}</p>
        <p><strong>Total Items:</strong> ${progressData.totalItems || 0}</p>
        <p><strong>Processed Items:</strong> ${progressData.processedItems || 0}</p>
        <p><strong>Successful Items:</strong> ${progressData.successfulItems || 0}</p>
        <p><strong>Failed Items:</strong> ${progressData.failedItems || 0}</p>
        <p><strong>Percentage Complete:</strong> ${progressData.percentageComplete || 0}%</p>
        <p><strong>Status Message:</strong> ${progressData.statusMessage || progressData.state || 'Unknown'}</p>
        <p><strong>Started:</strong> ${progressData.timeStarted ? DateUtils.formatDateTime(new Date(progressData.timeStarted), true): 'Unknown'}</p>
        <p><strong>Completed:</strong> ${progressData.timeFinished? DateUtils.formatDateTime(new Date(progressData.timeFinished), true) : 'Not finished'}</p>
        <p><strong>Stage:</strong> ${ progressData.state || 'Unknown'}</p>
        <p><strong>Current Stage:</strong> ${progressData.currentStage || 'None'}</p>
        <p><strong>Duration:</strong> ${progressData.getDuration() || 'None'}</p>
        ${progressData.errorMessage ? `<p style="color: red;"><strong>Error:</strong> ${progressData.errorMessage}</p>` : '' }
      </div>
      `,
      confirmText: 'Replay Session',
      cancelText: 'Cancel',
      innerHTML: true,
    };
  
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: confirm,
      maxWidth: '90vw'
    });
  
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.seriesService.replaySession(progressData.sessionId!).subscribe({
          next: (data: any) => {
            // Handle success
            console.log('Session replayed successfully:', data);
            // Optionally show success notification
          },
          error: (error: any) => {
            // Handle error
            console.error('Error replaying session:', error);
            // Optionally show error notification
          }
        });
      }
    });
  }

  // Helper method to convert Python image URL to Java backend URL
  private convertToJavaImageUrl(
    sessionId: string,
    pythonImageUrl: string
  ): string {
    // Extract filename from Python URL
    // Python URL: "/inferno-comics-recognition/api/v1/stored_images/session_id/filename.jpg"
    const urlParts = pythonImageUrl.split('/');
    const filename = urlParts[urlParts.length - 1];

    // Convert to Java backend URL
    // Java URL: "http://rest-url:8080/inferno-comics-rest/api/progress/image/session_id/filename.jpg"
    return `${this.environmentService.settings?.restUrl}/recog/image/${sessionId}/${filename}`;
  }
}