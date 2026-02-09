import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  signal,
  WritableSignal,
  HostListener,
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
import { MatDialog } from '@angular/material/dialog';
import { Subscription, interval } from 'rxjs';
import { CombinedStatusCellRenderer } from './renderers/combined-status-cell.renderer';
import { EvaluationLinkCellRenderer } from './renderers/evaluation-link-cell.renderer';
import { TimeInfoCellRenderer } from './renderers/time-info-cell.renderer';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { MaterialModule } from '../../../../material.module';
import { ApiResponse } from '../../../../models/api-response.model';
import { ComicMatch } from '../../../../models/comic-match.model';
import { ProgressData, State } from '../../../../models/progress-data.model';
import { EnvironmentService } from '../../../../services/environment.service';
import { MessageService } from '../../../../services/message.service';
import { ProgressDataService } from '../../../../services/progress-data.service';
import { RecognitionService } from '../../../../services/recognition.service';
import { SeriesService } from '../../../../services/series.service';
import { WebsocketService, WebSocketResponseList } from '../../../../services/websocket.service';
import { DateUtils } from '../../../../utils/date-utils';
import { ConfirmationDialogData, ConfirmationDialogComponent } from '../../../common/dialog/confirmation-dialog/confirmation-dialog.component';
import { ProcessingResult } from '../../../../models/processing-result.model';

@Component({
  selector: 'app-progress-data-table',
  templateUrl: './progress-data-table.component.html',
  styleUrls: ['./progress-data-table.component.scss'],
  imports: [MaterialModule, AgGridModule, CommonModule],
})
export class ProgressDataTable implements OnInit, OnDestroy {
  @Input() id!: number;
  @Output() resultEmitter: EventEmitter<any> = new EventEmitter<any>(undefined);

  progressData: WritableSignal<any[]> = signal<any[]>([]);

  private wsSub!: Subscription;
  isLoading = true;

  // Mobile detection
  isMobile: boolean = false;
  private mobileBreakpoint = 768;

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

  constructor(
    private dialog: MatDialog,
    private messageService: MessageService,
    private httpClient: HttpClient,
    private websocket: WebsocketService,
    private seriesService: SeriesService,
    private recognitionService: RecognitionService,
    private environmentService: EnvironmentService,
    private progressDataService: ProgressDataService,
  ) {
    this.checkMobile();
    this.gridOptions = {
      animateRows: true,
      cellFlashDuration: 0,
      suppressColumnVirtualisation: false,
      suppressRowVirtualisation: false,
      suppressDragLeaveHidesColumns: true,
      suppressMovableColumns: false,
      pagination: false,
      rowHeight: 80,
      headerHeight: 40,
      columnDefs: this.getColumnDefs(),
      getRowId: (params) => params.data.sessionId, // Enable row identification for smooth updates
      onGridReady: (params) => this.onGridReady(params),
      onFirstDataRendered: (params) => this.onFirstDataRendered(params),
    };
  }

  ngOnInit(): void {
    this.loadProgressData();

    this.wsSub = this.websocket.messages$.subscribe((msg: any) => {
      const response: WebSocketResponseList = msg as WebSocketResponseList;
      if (response.name == 'ProgressDataListTable' && response.seriesId == this.id) {
        const newData: ProgressData[] = response.payload.map((item) => new ProgressData(item));
        this.updateGridWithTransaction(newData);
      }
    });
  }

  private updateGridWithTransaction(newData: ProgressData[]): void {
    const oldData = this.progressData();
    this.progressData.set(newData);

    if (!this.gridApi) return;

    // Build maps for comparison
    const oldMap = new Map(oldData.map(item => [item.sessionId, item]));
    const newMap = new Map(newData.map(item => [item.sessionId, item]));

    const toAdd: ProgressData[] = [];
    const toUpdate: ProgressData[] = [];
    const toRemove: ProgressData[] = [];

    // Find additions and updates
    for (const item of newData) {
      const existing = oldMap.get(item.sessionId);
      if (!existing) {
        toAdd.push(item);
      } else if (this.hasChanged(existing, item)) {
        toUpdate.push(item);
      }
    }

    // Find removals
    for (const item of oldData) {
      if (!newMap.has(item.sessionId)) {
        toRemove.push(item);
      }
    }

    // Apply transaction if there are changes
    if (toAdd.length > 0 || toUpdate.length > 0 || toRemove.length > 0) {
      this.gridApi.applyTransaction({
        add: toAdd,
        update: toUpdate,
        remove: toRemove,
      });

      // Refresh cells for updated rows to trigger cell renderer updates
      if (toUpdate.length > 0) {
        const rowNodes = toUpdate
          .map(item => this.gridApi!.getRowNode(item.sessionId!))
          .filter(node => node != null);

        if (rowNodes.length > 0) {
          this.gridApi.refreshCells({
            rowNodes: rowNodes as any[],
            force: true,
          });
        }
      }
    }
  }

  private hasChanged(oldItem: ProgressData, newItem: ProgressData): boolean {
    return (
      oldItem.state !== newItem.state ||
      oldItem.percentageComplete !== newItem.percentageComplete ||
      oldItem.currentStage !== newItem.currentStage ||
      oldItem.processedItems !== newItem.processedItems ||
      oldItem.successfulItems !== newItem.successfulItems ||
      oldItem.failedItems !== newItem.failedItems ||
      oldItem.errorMessage !== newItem.errorMessage
    );
  }

  ngOnDestroy(): void {
    if (this.wsSub) {
      this.wsSub.unsubscribe();
    }
  }

  // Mobile detection methods
  @HostListener('window:resize')
  onResize() {
    this.checkMobile();
  }

  private checkMobile() {
    this.isMobile = window.innerWidth <= this.mobileBreakpoint;
  }

  // Helper methods for mobile view
  formatTime(dateString: string | Date | undefined): string {
    if (!dateString) return '-';
    try {
      return DateUtils.formatDateTime(new Date(dateString), true);
    } catch {
      return '-';
    }
  }

  async openEvaluationUrl(sessionId: string): Promise<void> {
    try {
      const response = await this.httpClient
        .get<{ evaluationUrl: string }>(
          `${this.environmentService.settings?.restUrl}/progress/evaluation/${sessionId}`
        )
        .toPromise();

      if (!response?.evaluationUrl) {
        console.error('No evaluation URL received from server');
        return;
      }

      const rawUrl = response.evaluationUrl.trim();

      const absoluteUrl = /^https?:\/\//i.test(rawUrl)
        ? rawUrl
        : `${window.location.protocol}//${rawUrl}`;

      const evaluationUrl = new URL(absoluteUrl);

      evaluationUrl.protocol = window.location.protocol;
      evaluationUrl.hostname = window.location.hostname;

      if (this.environmentService.settings?.production) {
        evaluationUrl.port = window.location.port ? window.location.port : '';
      }

      const finalUrl = evaluationUrl.toString();
      console.log('Opening evaluation URL:', finalUrl);
      window.open(finalUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Error fetching evaluation URL:', error);
    }
  }

  private loadProgressData(): void {
    this.progressDataService.getProgressData(this.id).subscribe({
      next: (res: ApiResponse<ProgressData[]>) => {
        if (!res.data) throw new Error(`Failed to load progress data for ID ${this.id}: no data returned`);

        const newData = res.data.map(data => new ProgressData(data));

        if (this.gridApi && this.progressData().length > 0) {
          // Use transaction for subsequent loads
          this.updateGridWithTransaction(newData);
        } else {
          // Initial load - set data directly
          this.progressData.set(newData);
          if (this.gridApi) {
            this.gridApi.setGridOption('rowData', newData);
            setTimeout(() => this.gridApi?.sizeColumnsToFit(), 100);
          }
        }
        this.isLoading = false;
      },
      error: (err: Error) => {
        console.error('Failed to load progress data:', err);
        this.isLoading = false;
      },
    });
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
        this.messageService.success('Progress deleted');
  
        this.loadProgressData();
      },
      error: (err: Error) => {
        this.messageService.error(err.message);
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
          next: (data: ApiResponse<ProcessingResult>) => {
            console.log('Session replayed successfully:', data);
            this.messageService.success(data.message);
          },
          error: (data: ApiResponse<ProcessingResult>) => {
            this.messageService.error(data.message);
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