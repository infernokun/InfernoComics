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

@Component({
  selector: 'app-progress-data-table',
  template: `
    <div class="grid-container">
      <div class="grid-header">
        <h2 class="grid-title">Progress Data</h2>
        <button class="refresh-button" (click)="refreshData()">
          <span class="refresh-icon">🔄</span>
          <span class="refresh-text">Refresh</span>
        </button>
      </div>

      <!-- Mobile Card View -->
      @if (isMobile) {
        <div class="mobile-cards">
          @for (item of progressData(); track item.sessionId) {
            <div class="progress-card"
                 [class.state-completed]="item.state === 'COMPLETED'"
                 [class.state-processing]="item.state === 'PROCESSING'"
                 [class.state-failed]="item.state === 'FAILED'"
                 [class.state-pending]="item.state === 'PENDING'">
              
              <div class="card-header">
                <div class="state-badge" [class]="'state-' + item.state?.toLowerCase()">
                  {{ item.state }}
                </div>
                <div class="card-actions">
                  @if (item.state === 'COMPLETED') {
                    <button class="action-btn replay-btn" 
                            (click)="replaySession(item)"
                            title="Replay">
                            ▶️
                    </button>
                    <button class="action-btn add-btn" 
                            (click)="getSessionJSON(item.sessionId)"
                            title="Add Results">
                            ➕
                    </button>
                  }
                  <button class="action-btn delete-btn" 
                          (click)="deleteProgressData(item.sessionId)"
                          title="Delete">
                          🗑️
                  </button>
                </div>
              </div>

              <div class="card-progress">
                <div class="progress-bar-mobile">
                  <div class="progress-fill-mobile" 
                       [style.width.%]="item.percentageComplete || 0"
                       [class.processing]="item.state === 'PROCESSING'">
                  </div>
                  <span class="progress-percent">{{ item.percentageComplete || 0 }}%</span>
                </div>
                <div class="progress-counts">
                  <span class="count-item">
                    <span class="count-label">Processed</span>
                    <span class="count-value">{{ item.processedItems || 0 }}</span>
                  </span>
                  <span class="count-item">
                    <span class="count-label">Success</span>
                    <span class="count-value success">{{ item.successfulItems || 0 }}</span>
                  </span>
                  <span class="count-item">
                    <span class="count-label">Failed</span>
                    <span class="count-value failed">{{ item.failedItems || 0 }}</span>
                  </span>
                </div>
              </div>

              <div class="card-details">
                <div class="detail-row">
                  <span class="detail-label">Session ID</span>
                  <span class="detail-value session-id">{{ item.sessionId }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Started</span>
                  <span class="detail-value">{{ formatTime(item.timeStarted) }}</span>
                </div>
                @if (item.timeFinished) {
                  <div class="detail-row">
                    <span class="detail-label">Finished</span>
                    <span class="detail-value">{{ formatTime(item.timeFinished) }}</span>
                  </div>
                }
                @if (item.statusMessage) {
                  <div class="detail-row">
                    <span class="detail-label">Status</span>
                    <span class="detail-value status-msg">{{ item.statusMessage }}</span>
                  </div>
                }
              </div>

              <div class="card-footer">
                <a class="eval-link" (click)="openEvaluationUrl(item.sessionId)" *ngIf="item.state === 'COMPLETED'" style="cursor: pointer; color: blue; text-decoration: underline;">
                  View Evaluation →
                </a>
              </div>
            </div>
          }

          @if (progressData().length === 0) {
            <div class="empty-state">
              <div class="empty-icon">📊</div>
              <p>No progress data available</p>
            </div>
          }
        </div>
      }

      <!-- Desktop AG-Grid View -->
      @if (!isMobile) {
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
      }
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

      @media (max-width: 768px) {
        .grid-container {
          height: auto;
          min-height: 400px;
          max-height: 80vh;
        }
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

      @media (max-width: 480px) {
        .grid-title {
          font-size: 1rem;
        }
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

      @media (max-width: 480px) {
        .refresh-text {
          display: none;
        }
        .refresh-button {
          padding: 0.25rem 0.5rem;
        }
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

      .mobile-cards {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .progress-card {
        background: #fff;
        border: 1px solid #e0e0e0;
        border-radius: 10px;
        padding: 12px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        transition: all 0.2s ease;
        border-left: 4px solid #ccc;
      }

      .progress-card.state-completed {
        border-left-color: #28a745;
      }

      .progress-card.state-processing {
        border-left-color: #007bff;
        animation: pulse-border 2s infinite;
      }

      .progress-card.state-failed {
        border-left-color: #dc3545;
      }

      .progress-card.state-pending {
        border-left-color: #ffc107;
      }

      @keyframes pulse-border {
        0%, 100% { border-left-color: #007bff; }
        50% { border-left-color: #66b2ff; }
      }

      /* Card Header */
      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
      }

      .state-badge {
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .state-badge.state-completed {
        background: rgba(40, 167, 69, 0.15);
        color: #28a745;
      }

      .state-badge.state-processing {
        background: rgba(0, 123, 255, 0.15);
        color: #007bff;
      }

      .state-badge.state-failed {
        background: rgba(220, 53, 69, 0.15);
        color: #dc3545;
      }

      .state-badge.state-pending {
        background: rgba(255, 193, 7, 0.15);
        color: #856404;
      }

      .card-actions {
        display: flex;
        gap: 6px;
      }

      .action-btn {
        width: 32px;
        height: 32px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        background: #f0f0f0;
      }

      .action-btn:hover {
        transform: scale(1.1);
      }

      .replay-btn:hover { background: rgba(0, 123, 255, 0.2); }
      .add-btn:hover { background: rgba(40, 167, 69, 0.2); }
      .delete-btn:hover { background: rgba(220, 53, 69, 0.2); }

      /* Progress Section */
      .card-progress {
        margin-bottom: 12px;
      }

      .progress-bar-mobile {
        position: relative;
        height: 20px;
        background: #e9ecef;
        border-radius: 10px;
        overflow: hidden;
        margin-bottom: 8px;
      }

      .progress-fill-mobile {
        height: 100%;
        background: linear-gradient(90deg, #28a745 0%, #20c997 100%);
        border-radius: 10px;
        transition: width 0.3s ease;
      }

      .progress-fill-mobile.processing {
        background: linear-gradient(90deg, #007bff 0%, #66b2ff 100%);
        animation: progress-shimmer 2s infinite;
      }

      @keyframes progress-shimmer {
        0% { opacity: 0.7; }
        50% { opacity: 1; }
        100% { opacity: 0.7; }
      }

      .progress-percent {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 11px;
        font-weight: 600;
        color: #fff;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
      }

      .progress-counts {
        display: flex;
        justify-content: space-between;
        gap: 8px;
      }

      .count-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        flex: 1;
        background: #f8f9fa;
        padding: 6px;
        border-radius: 6px;
      }

      .count-label {
        font-size: 0.65rem;
        color: #6c757d;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }

      .count-value {
        font-size: 0.9rem;
        font-weight: 600;
        color: #333;
      }

      .count-value.success { color: --success-color }
      .count-value.failed { color: --error-color }

      /* Card Details */
      .card-details {
        border-top: 1px solid #eee;
        padding-top: 10px;
        margin-bottom: 10px;
      }

      .detail-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 0;
        font-size: 0.8rem;
      }

      .detail-label {
        color: #6c757d;
        font-weight: 500;
      }

      .detail-value {
        color: #333;
        font-weight: 500;
        text-align: right;
        max-width: 60%;
      }

      .detail-value.session-id {
        font-family: monospace;
        font-size: 0.75rem;
        background: #f0f0f0;
        padding: 2px 6px;
        border-radius: 4px;
      }

      .detail-value.status-msg {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* Card Footer */
      .card-footer {
        border-top: 1px solid #eee;
        padding-top: 10px;
        text-align: center;
      }

      .eval-link {
        color: #007bff;
        text-decoration: none;
        font-size: 0.85rem;
        font-weight: 500;
        transition: all 0.2s ease;
      }

      .eval-link:hover {
        text-decoration: underline;
      }

      /* Empty State */
      .empty-state {
        text-align: center;
        padding: 40px 20px;
        color: #6c757d;
      }

      .empty-icon {
        font-size: 48px;
        margin-bottom: 12px;
      }

      :host-context(.dark-theme),
      :host-context([data-theme="dark"]) {
        .grid-container {
          background: #1e1e2e;
          border-color: #3d3d5c;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
        }

        .grid-header {
          background: linear-gradient(135deg, #2a2a40 0%, #1e1e2e 100%);
          border-bottom-color: #3d3d5c;
        }

        .grid-title {
          color: #e0e0e0;
        }

        .refresh-button {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
        }

        .refresh-button:hover {
          background: linear-gradient(135deg, #818cf8 0%, #a78bfa 100%);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
        }

        /* AG-Grid Dark Mode */
        .ag-theme-quartz {
          --ag-background-color: #1e1e2e;
          --ag-header-background-color: #2a2a40;
          --ag-odd-row-background-color: #252538;
          --ag-row-hover-color: #3d3d5c;
          --ag-border-color: #3d3d5c;
          --ag-header-foreground-color: #e0e0e0;
          --ag-foreground-color: #c0c0c0;
          --ag-secondary-foreground-color: #a0a0a0;
        }

        .ag-theme-quartz .ag-row {
          border-bottom-color: #3d3d5c;
        }

        .ag-theme-quartz .ag-row:hover {
          background-color: #3d3d5c;
        }

        .ag-theme-quartz .ag-header-cell-label {
          color: #e0e0e0;
        }

        /* Mobile Cards Dark Mode */
        .mobile-cards {
          background: #1e1e2e;
        }

        .progress-card {
          background: #252538;
          border-color: #3d3d5c;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        .progress-card.state-completed {
          border-left-color: #10b981;
          background: linear-gradient(135deg, #252538 0%, rgba(16, 185, 129, 0.05) 100%);
        }

        .progress-card.state-processing {
          border-left-color: #6366f1;
          background: linear-gradient(135deg, #252538 0%, rgba(99, 102, 241, 0.05) 100%);
        }

        .progress-card.state-failed {
          border-left-color: #ef4444;
          background: linear-gradient(135deg, #252538 0%, rgba(239, 68, 68, 0.05) 100%);
        }

        .progress-card.state-pending {
          border-left-color: #f59e0b;
          background: linear-gradient(135deg, #252538 0%, rgba(245, 158, 11, 0.05) 100%);
        }

        /* State Badges Dark Mode */
        .state-badge.state-completed {
          background: rgba(16, 185, 129, 0.2);
          color: #34d399;
        }

        .state-badge.state-processing {
          background: rgba(99, 102, 241, 0.2);
          color: #a5b4fc;
        }

        .state-badge.state-failed {
          background: rgba(239, 68, 68, 0.2);
          color: #fca5a5;
        }

        .state-badge.state-pending {
          background: rgba(245, 158, 11, 0.2);
          color: #fcd34d;
        }

        /* Action Buttons Dark Mode */
        .action-btn {
          background: #3d3d5c;
          border: 1px solid #4d4d6d;
        }

        .action-btn:hover {
          background: #4d4d6d;
        }

        .replay-btn:hover { 
          background: rgba(99, 102, 241, 0.3); 
          border-color: #6366f1;
        }
        .add-btn:hover { 
          background: rgba(16, 185, 129, 0.3); 
          border-color: #10b981;
        }
        .delete-btn:hover { 
          background: rgba(239, 68, 68, 0.3); 
          border-color: #ef4444;
        }

        /* Progress Bar Dark Mode */
        .progress-bar-mobile {
          background: #3d3d5c;
        }

        .progress-fill-mobile {
          background: linear-gradient(90deg, #10b981 0%, #34d399 100%);
        }

        .progress-fill-mobile.processing {
          background: linear-gradient(90deg, #6366f1 0%, #a5b4fc 100%);
        }

        .progress-percent {
          color: #fff;
          text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
        }

        /* Progress Counts Dark Mode */
        .progress-counts {
          gap: 6px;
        }

        .count-item {
          background: #1e1e2e;
          border: 1px solid #3d3d5c;
        }

        .count-label {
          color: #8b8ba3;
        }

        .count-value {
          color: #e0e0e0;
        }

        .count-value.success { color: #34d399; }
        .count-value.failed { color: #fca5a5; }

        /* Card Details Dark Mode */
        .card-details {
          border-top-color: #3d3d5c;
        }

        .detail-row {
          border-bottom: 1px solid rgba(61, 61, 92, 0.3);
        }

        .detail-row:last-child {
          border-bottom: none;
        }

        .detail-label {
          color: #8b8ba3;
        }

        .detail-value {
          color: #c0c0c0;
        }

        .detail-value.session-id {
          background: #1e1e2e;
          color: #a5b4fc;
          border: 1px solid #3d3d5c;
        }

        .detail-value.status-msg {
          color: #a0a0a0;
        }

        /* Card Footer Dark Mode */
        .card-footer {
          border-top-color: #3d3d5c;
        }

        .eval-link {
          color: #a5b4fc;
          font-weight: 600;
        }

        .eval-link:hover {
          color: #c4b5fd;
        }

        /* Empty State Dark Mode */
        .empty-state {
          color: #8b8ba3;
        }

        .empty-state p {
          color: #a0a0a0;
        }

        /* Scrollbar Dark Mode */
        .mobile-cards::-webkit-scrollbar {
          width: 6px;
        }

        .mobile-cards::-webkit-scrollbar-track {
          background: #1e1e2e;
        }

        .mobile-cards::-webkit-scrollbar-thumb {
          background: #4d4d6d;
          border-radius: 3px;
        }

        .mobile-cards::-webkit-scrollbar-thumb:hover {
          background: #6366f1;
        }
      }
    `,
  ],
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

  private refreshSubscription?: Subscription;
  private readonly REFRESH_INTERVAL_MS = 30000; // 30 seconds

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
        if (!res.data) throw new Error(`Failed to load progress data for ID ${this.id}: no data returned`);

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