import { CommonModule } from "@angular/common";
import { Component, Inject } from "@angular/core";
import { MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MaterialModule } from "../../../../material.module";
import { ApiResponse } from "../../../../models/api-response.model";
import { SeriesService } from "../../../../services/series.service";
import { Clipboard, ClipboardModule } from "@angular/cdk/clipboard";
import { MessageService } from "../../../../services/message.service";

@Component({
  selector: 'app-json-dialog',
  template: `
    <div class="json-dialog">
      <div class="dialog-header">
        <h2 mat-dialog-title>Series Folder Structure</h2>
        <button mat-icon-button (click)="close()" class="close-btn">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      
      <mat-dialog-content class="dialog-content">
        <div class="metadata-section">
          <div class="metadata-chip">
            <mat-icon>check_circle</mat-icon>
            <span>{{ data.code }} - {{ data.message }}</span>
          </div>
          <div class="metadata-chip">
            <mat-icon>schedule</mat-icon>
            <span>{{ data.timeMs }}ms</span>
          </div>
          <div class="metadata-chip">
            <mat-icon>folder</mat-icon>
            <span>{{ data.totalCount }} total series</span>
          </div>
          <div class="metadata-chip">
            <mat-icon>pages</mat-icon>
            <span>Page {{ data.currentPage + 1 }} of {{ totalPages }}</span>
          </div>
        </div>

        <div class="series-grid">
          <div class="series-card" *ngFor="let series of data.data" (click)="copyFolderId(series.name)" style="cursor: pointer;" matTooltip="Click to copy folder ID">
            <div class="series-id">ID: {{ series.id }}</div>
            <div class="series-name">{{ formatSeriesName(series.name) }}</div>
            <div class="series-raw">{{ series.name }}</div>
          </div>
        </div>

        <div class="pagination-controls" *ngIf="totalPages > 1">
          <button 
            mat-icon-button 
            (click)="goToFirstPage()" 
            [disabled]="data.currentPage === 0"
            class="page-btn">
            <mat-icon>first_page</mat-icon>
          </button>
          <button 
            mat-icon-button 
            (click)="previousPage()" 
            [disabled]="data.currentPage === 0"
            class="page-btn">
            <mat-icon>chevron_left</mat-icon>
          </button>
          
          <span class="page-info">
            {{ data.currentPage + 1 }} / {{ totalPages }}
          </span>
          
          <button 
            mat-icon-button 
            (click)="nextPage()" 
            [disabled]="data.currentPage >= totalPages - 1"
            class="page-btn">
            <mat-icon>chevron_right</mat-icon>
          </button>
          <button 
            mat-icon-button 
            (click)="goToLastPage()" 
            [disabled]="data.currentPage >= totalPages - 1"
            class="page-btn">
            <mat-icon>last_page</mat-icon>
          </button>
        </div>

        <div class="raw-json-section">
          <div class="section-header" (click)="toggleRawJson()">
            <mat-icon>{{ showRawJson ? 'expand_less' : 'expand_more' }}</mat-icon>
            <span>Raw JSON Response</span>
          </div>
          <div class="json-container" *ngIf="showRawJson">
            <pre class="json-display">{{ formatJson(data) }}</pre>
          </div>
        </div>
      </mat-dialog-content>
      
      <mat-dialog-actions align="end">
        <button mat-stroked-button (click)="copyToClipboard()" color="primary">
          <mat-icon>content_copy</mat-icon>
          Copy JSON
        </button>
        <button mat-raised-button (click)="close()" color="primary">
          Close
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .json-dialog {
      width: 100%;
      max-width: 900px;
      background: #1a1a1a;
      color: #e0e0e0;
    }

    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px 0;
      border-bottom: 2px solid #7c4dff;
      background: #1a1a1a;
    }

    .dialog-header h2 {
      margin: 0;
      padding-bottom: 16px;
      font-size: 24px;
      font-weight: 500;
      color: #bb86fc;
    }

    .close-btn {
      margin-top: -8px;
      color: #bb86fc;
    }

    .close-btn:hover {
      background: rgba(187, 134, 252, 0.1);
    }

    .dialog-content {
      max-height: 70vh;
      overflow-y: auto;
      padding: 0 !important;
      background: #121212;
    }

    .metadata-section {
      display: flex;
      gap: 12px;
      padding: 20px 24px;
      background: linear-gradient(135deg, #7c4dff 0%, #b47cff 100%);
      flex-wrap: wrap;
    }

    .metadata-chip {
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(26, 26, 26, 0.95);
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 500;
      color: #e0e0e0;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      border: 1px solid rgba(124, 77, 255, 0.3);
    }

    .metadata-chip mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #bb86fc;
    }

    .series-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
      padding: 24px;
      background: #121212;
      min-height: 400px;
    }

    .series-card {
      background: #1e1e1e;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      transition: all 0.3s ease;
      border-left: 4px solid #7c4dff;
      border: 1px solid #2a2a2a;
      border-left: 4px solid #7c4dff;
    }

    .series-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 4px 16px rgba(124, 77, 255, 0.4);
      border-color: #7c4dff;
      background: #252525;
    }

    .series-id {
      font-size: 12px;
      font-weight: 600;
      color: #bb86fc;
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }

    .series-name {
      font-size: 16px;
      font-weight: 500;
      color: #e0e0e0;
      margin-bottom: 6px;
      line-height: 1.4;
    }

    .series-raw {
      font-size: 11px;
      color: #888;
      font-family: 'Courier New', monospace;
      word-break: break-word;
    }

    .pagination-controls {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
      padding: 16px 24px;
      background: #1a1a1a;
      border-top: 1px solid #2a2a2a;
      border-bottom: 1px solid #2a2a2a;
    }

    .page-btn {
      color: #bb86fc;
    }

    .page-btn:disabled {
      color: #555;
    }

    .page-btn:not(:disabled):hover {
      background: rgba(187, 134, 252, 0.1);
    }

    .page-info {
      padding: 0 16px;
      font-weight: 500;
      color: #e0e0e0;
      min-width: 80px;
      text-align: center;
    }

    .raw-json-section {
      margin: 24px;
      border: 1px solid #2a2a2a;
      border-radius: 8px;
      overflow: hidden;
      background: #1a1a1a;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: #252525;
      cursor: pointer;
      user-select: none;
      transition: background 0.2s;
      border-bottom: 1px solid #2a2a2a;
    }

    .section-header:hover {
      background: #2a2a2a;
    }

    .section-header mat-icon {
      color: #bb86fc;
    }

    .section-header span {
      font-weight: 500;
      color: #e0e0e0;
    }

    .json-container {
      background-color: #0d0d0d;
      padding: 20px;
      max-height: 400px;
      overflow: auto;
    }

    .json-display {
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.6;
      color: #03dac6;
      background: transparent;
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
    }

    mat-dialog-actions {
      padding: 16px 24px;
      margin: 0;
      border-top: 1px solid #2a2a2a;
      background: #1a1a1a;
    }

    button {
      margin-left: 8px;
    }

    mat-icon {
      margin-right: 4px;
      vertical-align: middle;
    }

    .dialog-content::-webkit-scrollbar,
    .json-container::-webkit-scrollbar {
      width: 10px;
    }

    .dialog-content::-webkit-scrollbar-track,
    .json-container::-webkit-scrollbar-track {
      background: #1a1a1a;
    }

    .dialog-content::-webkit-scrollbar-thumb,
    .json-container::-webkit-scrollbar-thumb {
      background: #7c4dff;
      border-radius: 5px;
    }

    .dialog-content::-webkit-scrollbar-thumb:hover,
    .json-container::-webkit-scrollbar-thumb:hover {
      background: #bb86fc;
    }

    ::ng-deep .json-dialog-panel {
      background: #1a1a1a;
    }

    ::ng-deep .json-dialog-panel .mat-mdc-dialog-container {
      background: #1a1a1a;
      color: #e0e0e0;
    }
  `],
  imports: [MaterialModule, CommonModule, ClipboardModule]
})
export class JsonDialogComponent {
  showRawJson = false;

  constructor(
    private clipboard: Clipboard,
    private messageService: MessageService,
    private seriesService: SeriesService,
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<JsonDialogComponent>,
  ) {}

  get totalPages(): number {
    return Math.ceil(this.data.totalCount / this.data.pageSize);
  }

  formatSeriesName(name: string): string {
    const withoutId = name.replace(/^\d+_/, '');
    return withoutId
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  formatJson(obj: any): string {
    return JSON.stringify(obj, null, 2);
  }

  toggleRawJson(): void {
    this.showRawJson = !this.showRawJson;
  }

  nextPage(): void {
    if (this.data.currentPage < this.totalPages - 1) {
      this.loadPage(this.data.currentPage + 1);
    }
  }

  previousPage(): void {
    if (this.data.currentPage > 0) {
      this.loadPage(this.data.currentPage - 1);
    }
  }

  goToFirstPage(): void {
    this.loadPage(0);
  }

  goToLastPage(): void {
    this.loadPage(this.totalPages - 1);
  }

  private loadPage(page: number): void {
    this.seriesService.getSeriesFolderStructure(page, this.data.pageSize).subscribe(
      (response: ApiResponse<{id: number, name: string}[]>) => {
        this.data = response;
      }
    );
  }

  copyToClipboard(): void {
    this.clipboard.copy(this.formatJson(this.data));
    this.messageService.snackbar('JSON response copied to clipboard!');
  }

  copyFolderId(folderName: string): void {
    this.clipboard.copy(folderName);
    this.messageService.snackbar(`Folder ID "${folderName}" copied to clipboard!`);
  }

  close(): void {
    this.dialogRef.close();
  }
}