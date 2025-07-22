// progress-data-table.component.ts
import {
  Component,
  EventEmitter,
  Input,
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
import { AgGridModule } from 'ag-grid-angular';
import { MaterialModule } from '../../../material.module';
import { ComicMatch } from '../../../models/comic-match.model';

@Component({
  selector: 'app-progress-data-table',
  template: `
    <div class="grid-container">
      <div class="grid-header">
        <h2 class="grid-title">Progress Data</h2>
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
        height: 600px;
        border: 1px solid #d0d0d0;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        background: #fff;
      }
      .grid-header {
        padding: 0.5rem 1rem;
        background: #f5f5f5;
        border-bottom: 1px solid #e0e0e0;
        display: flex;
        align-items: center;
      }
      .grid-title {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
      }
      .grid-wrapper {
        flex: 1;
        overflow: hidden;
      }
      .ag-theme-quartz {
        height: 100%;
      }
    `,
  ],
  imports: [CommonModule, MaterialModule, AgGridModule],
})
export class ProgressDataTable implements OnInit {
  @Input() id!: number;

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

  @Output() resultEmitter: EventEmitter<any> = new EventEmitter<any>(undefined);

  constructor(private seriesService: SeriesService) {
    this.gridOptions = {
      animateRows: false,
      cellFlashDuration: 0,
      suppressColumnVirtualisation: false,
      suppressRowVirtualisation: false,
      suppressDragLeaveHidesColumns: true,
      suppressMovableColumns: false,
      pagination: false,
      columnDefs: this.getColumnDefs(),
      onGridReady: (params) => this.onGridReady(params),
      onFirstDataRendered: (params) => this.onFirstDataRendered(params),
    };
  }

  ngOnInit(): void {
    this.seriesService.getProgressData(this.id).subscribe((res) => {
      this.progressData.set(res);
      if (this.gridApi) {
        console.log('Updating grid with users:', this.progressData());
        this.gridApi.setGridOption('rowData', this.progressData());

        // Force refresh
        this.gridApi.refreshCells();

        // Size columns after data update
        setTimeout(() => {
          this.gridApi?.sizeColumnsToFit();
        }, 100);
      }
    });
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
        headerName: 'Actions',
        width: 130,
        pinned: 'left',
        sortable: false,
        filter: false,
        resizable: false,
        lockPosition: true,
        cellRenderer: AdminActionsComponent,
        cellRendererParams: (params: any) => {
          const state = params.data?.state;
          return {
            showPlay: state != 'COMPLETE' && state != 'PROCESSING',
            showAdd: state == 'COMPLETE',
            playClick: (data: any) => console.log('playClick', state),
            addClick: (data: any) => this.getSessionJSON(data.sessionId),
          };
        },
      },
      {
        headerName: 'Session ID',
        field: 'sessionId',
        sort: 'asc',
        filter: 'agNumberColumnFilter',
        minWidth: 60,
      },
      {
        headerName: 'State',
        field: 'state',
        filter: 'agTextColumnFilter',
        minWidth: 150,
      },
      {
        headerName: 'Time Started',
        field: 'timeStarted',
        filter: 'agTextColumnFilter',
        minWidth: 100,
      },
      {
        headerName: 'Time Finished',
        field: 'timeFinished',
        valueGetter: (params) => params.data?.timeFinished ?? 'Not Finished',
        filter: 'agTextColumnFilter',
        minWidth: 100,
      },
      {
        headerName: 'Link',
        field: 'sessionId',
        cellRenderer: (params: any) => {
          const sessionId = params.value;
          const url = `http://localhost:5000/inferno-comics-recognition/api/v1/evaluation/${sessionId}`;
          return `<a href="${url}" target="_blank" rel="noopener noreferrer">${sessionId}</a>`;
        },
        minWidth: 200,
        cellRendererParams: {
          suppressCount: true,
        },
        tooltipField: 'sessionId',
      },
    ];
  }

  getSessionJSON(sessionId: string) {
    this.seriesService.getSessionJSON(sessionId).subscribe((res) => {
      // Transform the session JSON data into the format expected by openMatchSelectionDialog
      const transformedData = this.transformSessionDataToMatches(res);
      this.resultEmitter.emit(transformedData);
    });
  }

  private transformSessionDataToMatches(sessionData: any): any {
    if (!sessionData?.results || !Array.isArray(sessionData.results)) {
      console.warn('No valid results found in session data');
      return null;
    }
  
    console.log(' Transforming session data:', sessionData);
  
    const allMatches: ComicMatch[] = [];
    
    sessionData.results.forEach((imageResult: any, imageIndex: number) => {
      console.log(`Processing image result ${imageIndex}:`, imageResult.image_name);
      
      // FIXED: Check for 'matches' instead of 'top_matches'
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
  
    console.log(` Total transformed matches: ${allMatches.length}`);
  
    return {
      action: 'open_match_dialog',
      matches: allMatches,
      sessionId: sessionData.session_id,
      isMultiple: sessionData.total_images > 1,
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
}
