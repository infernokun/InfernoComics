import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { EnvironmentService } from './environment.service';
import { ApiResponse } from '../models/api-response.model';

export interface RecognitionConfig {
  performance_level: string;
  result_batch: number;
  presets: Record<string, RecognitionPreset>;
  similarity_threshold: string;
}

export interface RecognitionPreset {
  detectors: Record<string, number>;
  feature_weights: Record<string, number>;
  image_size: number;
  max_workers: number;
  options: Options;
}

export interface Options {
  use_advanced_matching: boolean;
  use_comic_detection: boolean;
  cache_only?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class RecognitionService {
  private apiUrl: string = '';

  constructor(private http: HttpClient, private environmentService: EnvironmentService) {
    this.apiUrl = `${this.environmentService.settings?.restUrl}/recog`;
  }

  getRecognitionConfig(): Observable<ApiResponse<RecognitionConfig>> {
    return this.http.get<ApiResponse<RecognitionConfig>>(`${this.apiUrl}/config`);
  }

  saveRecognitionConfig(cfg: RecognitionConfig): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(`${this.apiUrl}/config`, cfg);
  }

  getSessionJSON(sessionId: string): Observable<ApiResponse<any>> {
    return this.http.get<ApiResponse<any>>(
      `${this.apiUrl}/json/${sessionId}`
    );
  }

  getCurrentImageUrl(data: any): string {
    if (data.issue.uploadedImageUrl) {
      return `${this.apiUrl}/image/${data.issue.uploadedImageUrl}`;
    }
    return data.issue.imageUrl || 'assets/placeholder-comic.jpg';
  }
}