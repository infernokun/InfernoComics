import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { EnvironmentService } from './environment.service';
import { ImageMatcherResponse } from '../components/series-detail/comic-match-selection/comic-match-selection.component';

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
  private progressUrl: string = '';

  constructor(
    private http: HttpClient,
    private environmentService: EnvironmentService
  ) {
    this.apiUrl = `${this.environmentService.settings?.restUrl}/series`;
    this.progressUrl = `${this.environmentService.settings?.restUrl}/progress`;
  }

  getAllSeries(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  getSeriesById(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}`);
  }

  createSeries(series: any): Observable<any> {
    return this.http.post<any>(this.apiUrl, series);
  }

  updateSeries(id: number, series: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${id}`, series);
  }

  deleteSeries(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/${id}`);
  }

  searchSeries(query: string): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.apiUrl}/search?query=${encodeURIComponent(query)}`
    );
  }

  // Comic Vine integration - for searching series when creating/editing
  searchComicVineSeries(query: string): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.apiUrl}/search-comic-vine?query=${encodeURIComponent(query)}`
    );
  }

  getSeriesStats(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/stats`);
  }

  getRecentSeries(limit: number = 10): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/recent?limit=${limit}`);
  }

  // ORIGINAL METHOD - Keep for backward compatibility
  addComicByImage(
    seriesId: number,
    imageFile: File
  ): Observable<ImageMatcherResponse> {
    const formData = new FormData();
    formData.append('image', imageFile);
    return this.http.post<ImageMatcherResponse>(
      `${this.apiUrl}/${seriesId}/add-comic-by-image`,
      formData
    );
  }

  addComicsByImagesWithSSE(
    seriesId: number,
    imageFiles: File[]
  ): Observable<SSEProgressData> {
    const progressSubject = new Subject<SSEProgressData>();

    const formData = new FormData();

    // FIXED: Use 'images' as the field name to match Java @RequestParam
    imageFiles.forEach((file) => {
      formData.append('images', file); // Changed from images[${index}] to just 'images'
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
          }, 500); // 500ms delay to ensure backend is ready
        },
        error: (error) => {
          console.error('Error starting multiple images analysis:', error);
          progressSubject.error(error);
        },
      });

    return progressSubject.asObservable();
  }

  // NEW SSE-BASED METHOD - Enhanced with real-time progress
  addComicByImageWithSSE(
    seriesId: number,
    file: File
  ): Observable<SSEProgressData> {
    const progressSubject = new Subject<SSEProgressData>();

    // Step 1: Start the process and get session ID
    const formData = new FormData();
    formData.append('image', file);

    this.http
      .post<{ sessionId: string }>(
        `${this.apiUrl}/${seriesId}/add-comic-by-image/start`,
        formData
      )
      .subscribe({
        next: (response) => {
          // Step 2: Wait a moment for the backend to initialize, then connect to SSE stream
          setTimeout(() => {
            this.connectToSSEProgress(
              seriesId,
              response.sessionId,
              progressSubject
            );
          }, 500); // 500ms delay to ensure backend is ready
        },
        error: (error) => {
          console.error('Error starting image analysis:', error);
          progressSubject.error(error);
        },
      });

    return progressSubject.asObservable();
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

    // Add more detailed error handling
    eventSource.onopen = (event) => {
      console.log('SSE connection opened successfully for session:', sessionId);
      console.log('Connection state:', eventSource.readyState); // Should be 1 (OPEN)
    };

    // Listen for the specific "progress" event name (not onmessage)
    eventSource.addEventListener('progress', (event: any) => {
      try {
        console.log('SSE progress event received:', event.data);
        const data: SSEProgressData = JSON.parse(event.data);

        console.log('Parsed SSE progress data:', data);

        // Skip heartbeat events (just for connection keep-alive)
        if (data.type === 'heartbeat') {
          console.log('SSE heartbeat received for session:', sessionId);
          return;
        }

        console.log('Processing SSE progress data:', data);
        progressSubject.next(data);

        // Close connection when complete or error
        if (data.type === 'complete' || data.type === 'error') {
          console.log(
            'SSE stream ending for session:',
            sessionId,
            'type:',
            data.type
          );
          console.log('SSE result data:', data.result);
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
        console.error('SSE connection timeout after 10 seconds');
        eventSource.close();
        progressSubject.error(new Error('Connection timeout'));
      }
    }, 10000); // 10 second timeout

    // Clear timeout when connection opens
    eventSource.addEventListener('open', () => {
      clearTimeout(connectionTimeout);
    });
  }

  // Utility method to check if SSE is supported
  isSSESupported(): boolean {
    return typeof EventSource !== 'undefined';
  }

  // Method to get session status (optional - for debugging)
  getImageAnalysisStatus(seriesId: number, sessionId: string): Observable<any> {
    return this.http.get<any>(
      `${this.apiUrl}/${seriesId}/add-comic-by-image/status?sessionId=${sessionId}`
    );
  }

  getProgressData(seriesId: number) {
    return this.http.get<any[]>(
      `${this.progressUrl}/data/${seriesId}`
    );
  }

  getSessionJSON(sessionId: string) {
    return this.http.get<any[]>(
      `${this.progressUrl}/json/${sessionId}`
    );
  }
}