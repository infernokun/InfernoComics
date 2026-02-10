import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { ImageMatcherResponse } from '../components/series/series-detail/comic-match-selection/comic-match-selection.component';
import { ApiResponse } from '../models/api-response.model';
import { ComicVineSeriesDto } from '../models/comic-vine.model';
import { ProcessingResult } from '../models/processing-result.model';
import { Series, SeriesWithIssues } from '../models/series.model';
import { EnvironmentService } from './environment.service';
import { BaseService } from './base.service';
import { MissingIssue } from '../models/missing-issue.model';

export interface SSEProgressData {
  type: 'progress' | 'complete' | 'error' | 'heartbeat';
  sessionId: string;
  stage?: string;
  progress?: number;
  message?: string;
  result?: ImageMatcherResponse;
  error?: string;
  timestamp: number;
}

@Injectable({
  providedIn: 'root',
})
export class SeriesService extends BaseService {
  private apiUrl: string = '';

  constructor(
    protected override http: HttpClient,
    private environmentService: EnvironmentService
  ) {
    super(http);
    this.apiUrl = `${this.environmentService.settings?.restUrl}/series`;
  }

  getAllSeries(): Observable<ApiResponse<Series[]>> {
    return this.get<ApiResponse<Series[]>>(this.apiUrl);
  }

  getSeriesById(id: number): Observable<ApiResponse<Series>> {
    return this.get<ApiResponse<Series>>(`${this.apiUrl}/${id}`);
  }

  getSeriesVariantsById(id: number): Observable<ApiResponse<any>> {
    return this.get<ApiResponse<any>>(`${this.apiUrl}/${id}/variants`);
  }

  getSeriesByIdWithIssues(
    id: number
  ): Observable<ApiResponse<SeriesWithIssues>> {
    return this.get<ApiResponse<SeriesWithIssues>>(
      `${this.apiUrl}/with-issues/${id}`
    );
  }

  getSeriesWithIssues(): Observable<ApiResponse<SeriesWithIssues[]>> {
    return this.get<ApiResponse<SeriesWithIssues[]>>(
      `${this.apiUrl}/with-issues`
    );
  }

  getSeriesFolderStructure(page: number = 0, pageSize: number = 8): Observable<ApiResponse<{id: number, name: string}[]>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('size', pageSize.toString());
    
    return this.http.get<ApiResponse<{id: number, name: string}[]>>(
      `${this.apiUrl}/folder`,
      { params }
    );
  }

  syncAllSeries(): Observable<ApiResponse<ProcessingResult[]>> {
    return this.post<ApiResponse<ProcessingResult[]>>(
      `${this.apiUrl}/startSync`,
      {}
    );
  }

  syncSeries(id: number): Observable<ApiResponse<ProcessingResult>> {
    return this.post<ApiResponse<ProcessingResult>>(
      `${this.apiUrl}/startSync/${id}`,
      {}
    );
  }

  createSeries(series: Series): Observable<ApiResponse<Series>> {
    return this.post<ApiResponse<Series>>(this.apiUrl, series);
  }

  updateSeries(id: number, series: any): Observable<ApiResponse<Series>> {
    return this.put<ApiResponse<Series>>(`${this.apiUrl}/${id}`, series);
  }

  deleteSeries(id: number): Observable<ApiResponse<void>> {
    return this.delete<ApiResponse<void>>(`${this.apiUrl}/${id}`);
  }

  searchSeries(query: string): Observable<ApiResponse<Series[]>> {
    return this.get<ApiResponse<Series[]>>(
      `${this.apiUrl}/search?query=${encodeURIComponent(query)}`
    );
  }

  searchComicVineSeries(
    query: string
  ): Observable<ApiResponse<ComicVineSeriesDto[]>> {
    return this.get<ApiResponse<ComicVineSeriesDto[]>>(
      `${this.apiUrl}/search-comic-vine?query=${encodeURIComponent(query)}`
    );
  }

  getSeriesStats(): Observable<ApiResponse<any>> {
    return this.get<ApiResponse<any>>(`${this.apiUrl}/stats`);
  }

  getRecentSeries(limit: number = 10): Observable<ApiResponse<Series[]>> {
    return this.get<ApiResponse<Series[]>>(
      `${this.apiUrl}/recent?limit=${limit}`
    );
  }

  reverifySeries(seriesId: number): Observable<ApiResponse<Series>> {
    return this.post<ApiResponse<Series>>(
      `${this.apiUrl}/reverify-metadata/${seriesId}`,
      {}
    );
  }

  replaySession(sessionId: string): Observable<ApiResponse<ProcessingResult>> {
    return this.post<ApiResponse<ProcessingResult>>(
      `${this.apiUrl}/replay/${sessionId}`,
      {}
    );
  }

  getMissingIssues(): Observable<ApiResponse<MissingIssue[]>> {
    return this.get<ApiResponse<MissingIssue[]>>(`${this.apiUrl}/missing-issues`);
  }

  removeMissingIssue(issueId: number): Observable<ApiResponse<void>> {
    return this.delete<ApiResponse<void>>(`${this.apiUrl}/missing-issues/${issueId}`);
  }

  refreshMissingIssues(): Observable<ApiResponse<MissingIssue[]>> {
    return this.post<ApiResponse<MissingIssue[]>>(`${this.apiUrl}/missing-issues/refresh`, {});
  }

  backfillRecognitionMetadata(): Observable<ApiResponse<{updated: number, skipped: number, failed: number}>> {
    return this.post<ApiResponse<{updated: number, skipped: number, failed: number}>>(
      `${this.apiUrl}/backfill-recognition-metadata`, {}
    );
  }

  addComicsByImagesWithSSE(
    seriesId: number,
    imageFiles: File[]
  ): Observable<SSEProgressData> {
    const progressSubject = new Subject<SSEProgressData>();

    const formData = new FormData();

    imageFiles.forEach((file) => {
      formData.append('images', file);
    });

    this.post<{ sessionId: string }>(
      `${this.apiUrl}/${seriesId}/add-comics-by-images/start`,
      formData
    ).subscribe({
      next: (response) => {
        setTimeout(() => {
          this.connectToSSEProgress(
            seriesId,
            response.sessionId,
            progressSubject,
            'add-comics-by-images'
          );
        }, 500);
      },
      error: (error) => {
        console.error('Error starting multiple images analysis:', error);
        progressSubject.error(error);
      },
    });

    return progressSubject.asObservable();
  }

  isSSESupported(): boolean {
    return typeof EventSource !== 'undefined';
  }

  private connectToSSEProgress(
    seriesId: number,
    sessionId: string,
    progressSubject: Subject<SSEProgressData>,
    endpoint: string = 'add-comic-by-image'
  ): void {
    const sseUrl = `${this.apiUrl}/${seriesId}/${endpoint}/progress?sessionId=${sessionId}`;
    console.log('Connecting to SSE URL:', sseUrl);

    const eventSource = new EventSource(sseUrl);
    let isCompleted = false; // Track if we've completed successfully

    eventSource.onopen = (event) => {
      console.log('SSE connection opened successfully for session:', sessionId);
      console.log('Connection state:', eventSource.readyState);
    };

    // Listen for the specific "progress" event name (not onmessage)
    eventSource.addEventListener('progress', (event: any) => {
      try {
        const data: SSEProgressData = JSON.parse(event.data);

        // Skip heartbeat events (just for connection keep-alive)
        if (data.type === 'heartbeat') {
          console.log('SSE heartbeat received for session:', sessionId);
          return;
        }

        progressSubject.next(data);

        // Close connection when complete or error
        const typeUpper = data.type?.toUpperCase();
        if (typeUpper === 'COMPLETE' || typeUpper === 'COMPLETED' || typeUpper === 'ERROR') {
          console.log(
            'SSE stream ending for session:',
            sessionId,
            'type:',
            data.type
          );
          isCompleted = true;
          eventSource.close();
          progressSubject.complete();
        }
      } catch (error) {
        console.error(
          'Error parsing SSE progress data:',
          error,
          'Raw data:',
          event.data
        );

        // Check if it's a large JSON that might be truncated
        if (typeof event.data === 'string' && event.data.length > 10000) {
          console.warn(
            'Very large SSE message received (',
            event.data.length,
            'chars), might be truncated'
          );
        }

        eventSource.close();
        progressSubject.error(new Error('Failed to parse progress data'));
      }
    });

    // Also listen for generic messages as fallback
    eventSource.onmessage = (event) => {
      console.log('SSE generic message received (fallback):', event.data);
      // This shouldn't normally be called if we're using named events
    };

    eventSource.onerror = (error) => {
      // Don't treat as error if we've already completed successfully
      if (isCompleted) {
        console.log('SSE connection closed after successful completion');
        return;
      }

      console.error('SSE connection error details:', {
        readyState: eventSource.readyState,
        url: sseUrl,
        error: error,
        target: error.target,
        type: error.type,
      });

      // Check if this is just a natural connection close after completion
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log('SSE connection closed (might be natural completion)');
        // Don't treat as error if we've already completed
        return;
      }

      // Check the readyState to understand the error better
      switch (eventSource.readyState) {
        case EventSource.CONNECTING:
          console.log('SSE: Still trying to connect...');
          break;
        case EventSource.OPEN:
          console.log('SSE: Connection is open but got an error');
          break;
        case EventSource.CLOSED:
          console.log('SSE: Connection is closed');
          break;
      }

      eventSource.close();
      progressSubject.error(
        new Error('Connection to server lost during image analysis')
      );
    };

    // Add timeout handling
    const connectionTimeout = setTimeout(() => {
      if (eventSource.readyState === EventSource.CONNECTING) {
        console.error('SSE connection timeout after 60 seconds');
        eventSource.close();
        progressSubject.error(new Error('Connection timeout'));
      }
    }, 60000); // 60 second timeout

    // Clear timeout when connection opens
    eventSource.addEventListener('open', () => {
      clearTimeout(connectionTimeout);
    });
  }
}
