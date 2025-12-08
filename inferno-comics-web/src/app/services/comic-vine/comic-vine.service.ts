import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ComicVineSeriesDto } from '../../models/comic-vine.model';
import { Issue } from '../../models/issue.model';
import { EnvironmentService } from '../environment/environment.service';
import { ApiResponse } from '../../models/api-response.model';

@Injectable({
  providedIn: 'root',
})
export class ComicVineService {
  apiUrl: string = '';

  constructor(private http: HttpClient, private environmentService: EnvironmentService) {
    this.apiUrl = this.environmentService.settings?.restUrl!;
  }

  searchSeries(query: string): Observable<ApiResponse<ComicVineSeriesDto[]>> {
    return this.http.get<ApiResponse<ComicVineSeriesDto[]>>(`${this.apiUrl}/series/search-comic-vine?query=${encodeURIComponent(query)}`);
  }

  searchIssues(seriesId: string): Observable<ApiResponse<ComicVineSeriesDto[]>> {
    return this.http.get<ApiResponse<ComicVineSeriesDto[]>>(`${this.apiUrl}/series/${seriesId}/search-comic-vine`);
  }

  getSeriesById(seriesId: string): Observable<ApiResponse<ComicVineSeriesDto>> {
    return this.http.get<ApiResponse<ComicVineSeriesDto>>(`${this.apiUrl}/series/get-comic-vine/${seriesId}`);
  }

  getIssueById(issueId: string): Observable<Issue> {
    return this.http.get<any>(`${this.apiUrl}/issues/get-comic-vine/${issueId}`);
  }
}