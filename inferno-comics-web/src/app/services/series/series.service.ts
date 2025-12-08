import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { ImageMatcherResponse } from '../../components/series-detail/comic-match-selection/comic-match-selection.component';
import { Series, SeriesWithIssues } from '../../models/series.model';
import { EnvironmentService } from '../environment/environment.service';
import { ApiResponse } from '../../models/api-response.model';
import { ProcessingResult } from '../../models/processing-result.model';
import { ComicVineSeriesDto } from '../../models/comic-vine.model';

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
export class SeriesService {
  private apiUrl: string = '';

  constructor(private http: HttpClient, private environmentService: EnvironmentService) {
    this.apiUrl = `${this.environmentService.settings?.restUrl}/series`;
  }

  getAllSeries(): Observable<ApiResponse<Series[]>> {
    return this.http.get<ApiResponse<Series[]>>(this.apiUrl);
  }

  getSeriesById(id: number): Observable<ApiResponse<Series>> {
    return this.http.get<ApiResponse<Series>>(`${this.apiUrl}/${id}`);
  }

  getSeriesByIdWithIssues(id: number): Observable<ApiResponse<SeriesWithIssues>> {
    return this.http.get<ApiResponse<SeriesWithIssues>>(`${this.apiUrl}/with-issues/${id}`);
  }

  getSeriesWithIssues(): Observable<ApiResponse<SeriesWithIssues[]>> {
    return this.http.get<ApiResponse<SeriesWithIssues[]>>(`${this.apiUrl}/with-issues`);
  }

  getSeriesFolderStructure(): Observable<ApiResponse<{id: number, name: string}[]>> {
    return this.http.get<ApiResponse<{id: number, name: string}[]>>(`${this.apiUrl}/folder`);
  }

  syncAllSeries(): Observable<ApiResponse<ProcessingResult[]>> {
    return this.http.post<ApiResponse<ProcessingResult[]>>(`${this.apiUrl}/startSync`, {});
  }

  syncSeries(id: number): Observable<ApiResponse<ProcessingResult>> {
    return this.http.post<ApiResponse<ProcessingResult>>(`${this.apiUrl}/startSync/${id}`, {});
  }

  createSeries(series: Series): Observable<ApiResponse<Series>> {
    return this.http.post<ApiResponse<Series>>(this.apiUrl, series);
  }

  updateSeries(id: number, series: any): Observable<ApiResponse<Series>> {
    return this.http.put<ApiResponse<Series>>(`${this.apiUrl}/${id}`, series);
  }

  deleteSeries(id: number): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.apiUrl}/${id}`);
  }

  searchSeries(query: string): Observable<ApiResponse<Series[]>> {
    return this.http.get<ApiResponse<Series[]>>(
      `${this.apiUrl}/search?query=${encodeURIComponent(query)}`
    );
  }

  searchComicVineSeries(query: string): Observable<ApiResponse<ComicVineSeriesDto[]>> {
    return this.http.get<ApiResponse<ComicVineSeriesDto[]>>(
      `${this.apiUrl}/search-comic-vine?query=${encodeURIComponent(query)}`
    );
  }

  getSeriesStats(): Observable<ApiResponse<any>> {
    return this.http.get<ApiResponse<any>>(`${this.apiUrl}/stats`);
  }

  getRecentSeries(limit: number = 10): Observable<ApiResponse<Series[]>> {
    return this.http.get<ApiResponse<Series[]>>(`${this.apiUrl}/recent?limit=${limit}`);
  }

  reverifySeries(seriesId: number): Observable<ApiResponse<Series>> {
    return this.http.post<ApiResponse<Series>>(`${this.apiUrl}/reverify-metadata/${seriesId}`, {});
  }

  replaySession(sessionId: string): Observable<ApiResponse<ProcessingResult>> {
    return this.http.post<ApiResponse<ProcessingResult>>(`${this.apiUrl}/replay/${sessionId}`, {});
  }

  addComicsByImagesWithSSE(seriesId: number, imageFiles: File[]): Observable<SSEProgressData> {
    const progressSubject = new Subject<SSEProgressData>();

    const formData = new FormData();

    imageFiles.forEach((file) => {
      formData.append('images', file);
    });

    this.http
      .post<{ sessionId: string }>(
        `${this.apiUrl}/${seriesId}/add-comics-by-images/start`,
        formData
      )
      .subscribe({
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

  private connectToSSEProgress(seriesId: number, sessionId: string, progressSubject: Subject<SSEProgressData>, endpoint: string = 'add-comic-by-image'): void {
    const sseUrl = `${this.apiUrl}/${seriesId}/${endpoint}/progress?sessionId=${sessionId}`;
    console.log('Connecting to SSE URL:', sseUrl);

    const eventSource = new EventSource(sseUrl);

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
        if (data.type === 'complete' || data.type === 'error') {
          console.log('SSE stream ending for session:', sessionId, 'type:', data.type);
          eventSource.close();
          progressSubject.complete();
        }
      } catch (error) {
        console.error('Error parsing SSE progress data:', error, 'Raw data:', event.data);

        // Check if it's a large JSON that might be truncated
        if (typeof event.data === 'string' && event.data.length > 10000) {
          console.warn('Very large SSE message received (', event.data.length, 'chars), might be truncated');
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

  isSSESupported(): boolean {
    return typeof EventSource !== 'undefined';
  }
}