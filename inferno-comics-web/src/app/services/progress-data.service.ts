import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ImageMatcherResponse } from '../components/series-detail/comic-match-selection/comic-match-selection.component';
import { ApiResponse } from '../models/api-response.model';
import { ProgressData } from '../models/progress-data.model';
import { EnvironmentService } from './environment.service';

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
export class ProgressDataService {
  private apiUrl: string = '';

  constructor(private http: HttpClient, private environmentService: EnvironmentService) {
    this.apiUrl = `${this.environmentService.settings?.restUrl}/progress`;
  }

  getProgressData(seriesId: number): Observable<ApiResponse<ProgressData[]>> {
    return this.http.get<ApiResponse<ProgressData[]>>(
      `${this.apiUrl}/data/${seriesId}`
    );
  }

  getRelProgressData(): Observable<ApiResponse<ProgressData[]>> {
    return this.http.get<ApiResponse<ProgressData[]>>(`${this.apiUrl}/data/rel`);
  }

  dismissProgressData(itemId: number): Observable<ApiResponse<ProgressData[]>> {
    return this.http.post<ApiResponse<ProgressData[]>>(`${this.apiUrl}/data/dismiss/${itemId}`, {});
  }

  deleteProgressData(sessionId: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.apiUrl}/${sessionId}`);
  }
}