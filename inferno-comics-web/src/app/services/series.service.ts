import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { EnvironmentService } from './environment.service';
import { ImageMatcherResponse } from '../components/series-detail/comic-match-selection/comic-match-selection.component';

export interface SSEProgressData {
  type: 'progress' | 'complete' | 'error';
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
  
  constructor(
    private http: HttpClient,
    private environmentService: EnvironmentService
  ) {
    this.apiUrl = `${this.environmentService.settings?.restUrl}/series`;
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
  addComicByImage(seriesId: number, imageFile: File): Observable<ImageMatcherResponse> {
    const formData = new FormData();
    formData.append('image', imageFile);
    return this.http.post<ImageMatcherResponse>(
      `${this.apiUrl}/${seriesId}/add-comic-by-image`,
      formData
    );
  }

  // NEW SSE-BASED METHOD - Enhanced with real-time progress
  addComicByImageWithSSE(seriesId: number, imageFile: File): Observable<SSEProgressData> {
    const progressSubject = new Subject<SSEProgressData>();
    
    // Step 1: Start the process and get session ID
    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('name', 'Unknown');
    formData.append('year', new Date().getFullYear().toString());

    this.http.post<{sessionId: string}>(
      `${this.apiUrl}/${seriesId}/add-comic-by-image/start`,
      formData
    ).subscribe({
      next: (response) => {
        // Step 2: Connect to SSE stream for real-time progress
        this.connectToSSEProgress(seriesId, response.sessionId, progressSubject);
      },
      error: (error) => {
        console.error('Error starting image analysis:', error);
        progressSubject.error(error);
      }
    });

    return progressSubject.asObservable();
  }

  private connectToSSEProgress(
    seriesId: number, 
    sessionId: string, 
    progressSubject: Subject<SSEProgressData>
  ): void {
    
    const eventSource = new EventSource(
      `${this.apiUrl}/${seriesId}/add-comic-by-image/progress?sessionId=${sessionId}`
    );

    eventSource.onmessage = (event) => {
      try {
        const data: SSEProgressData = JSON.parse(event.data);
        progressSubject.next(data);
        
        // Close connection when complete or error
        if (data.type === 'complete' || data.type === 'error') {
          eventSource.close();
          progressSubject.complete();
        }
      } catch (error) {
        console.error('Error parsing SSE data:', error);
        eventSource.close();
        progressSubject.error(new Error('Failed to parse progress data'));
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      eventSource.close();
      progressSubject.error(new Error('Connection to server lost during image analysis'));
    };

    // Handle EventSource states
    eventSource.onopen = () => {
      console.log('SSE connection opened for session:', sessionId);
    };

    // Clean up EventSource when observable is unsubscribed
    /*progressSubject.add(() => {
      if (eventSource.readyState !== EventSource.CLOSED) {
        eventSource.close();
        console.log('SSE connection closed for session:', sessionId);
      }
    });*/
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
}