import { Injectable } from '@angular/core';
import { EnvironmentService } from './environment.service';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Issue } from '../models/issue.model';
import { Series } from '../models/series.model';

@Injectable({
  providedIn: 'root',
})
export class ComicVineService {
  apiUrl: string = '';

  constructor(
    private http: HttpClient,
    private environmentService: EnvironmentService
  ) {
    this.apiUrl = this.environmentService.settings?.restUrl!;
  }

  // Search for series from Comic Vine
  searchSeries(query: string): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.apiUrl}/series/search-comic-vine?query=${encodeURIComponent(
        query
      )}`
    );
  }

  // Search for issues from Comic Vine for a specific series
  searchIssues(seriesId: string): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.apiUrl}/series/${seriesId}/search-comic-vine`
    );
  }

  getSeriesById(seriesId: string): Observable<ComicVineSeriesDto> {
    return this.http.get<ComicVineSeriesDto>(`${this.apiUrl}/series/get-comic-vine/${seriesId}`);
  }

  getIssueById(issueId: string): Observable<Issue> {
    return this.http.get<any>(`${this.apiUrl}/issues/get-comic-vine/${issueId}`);
  }
}

// Types for Comic Vine data (optional but helpful)
export interface ComicVineSeriesDto {
  id: string;
  name: string;
  description: string;
  issueCount: number;
  publisher: string;
  startYear: number;
  imageUrl: string;
}

export interface ComicVineIssueDto {
  id: string;
  issueNumber: string;
  name: string;
  description: string;
  coverDate: string;
  imageUrl: string;
}
