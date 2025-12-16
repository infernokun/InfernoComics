import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
import { ComicVineSeriesDto } from '../models/comic-vine.model';
import { Issue } from '../models/issue.model';
import { BaseService } from './base.service';
import { EnvironmentService } from './environment.service';

@Injectable({
  providedIn: 'root',
})
export class ComicVineService extends BaseService {
  apiUrl: string = '';

  constructor(
    protected override http: HttpClient,
    private environmentService: EnvironmentService
  ) {
    super(http);
    this.apiUrl = this.environmentService.settings?.restUrl!;
  }

  searchSeries(query: string): Observable<ApiResponse<ComicVineSeriesDto[]>> {
    return this.get<ApiResponse<ComicVineSeriesDto[]>>(
      `${this.apiUrl}/series/search-comic-vine?query=${encodeURIComponent(
        query
      )}`
    );
  }

  searchIssues(
    seriesId: string
  ): Observable<ApiResponse<ComicVineSeriesDto[]>> {
    return this.get<ApiResponse<ComicVineSeriesDto[]>>(
      `${this.apiUrl}/series/${seriesId}/search-comic-vine`
    );
  }

  getSeriesById(seriesId: string): Observable<ApiResponse<ComicVineSeriesDto>> {
    return this.get<ApiResponse<ComicVineSeriesDto>>(
      `${this.apiUrl}/series/get-comic-vine/${seriesId}`
    );
  }

  getIssueById(issueId: string): Observable<ApiResponse<Issue>> {
    return this.get<ApiResponse<Issue>>(
      `${this.apiUrl}/issues/get-comic-vine/${issueId}`
    );
  }
}
