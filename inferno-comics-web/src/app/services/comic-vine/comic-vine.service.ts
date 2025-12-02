import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ComicVineSeriesDto } from '../../models/comic-vine.model';
import { Issue } from '../../models/issue.model';
import { EnvironmentService } from '../environment/environment.service';

@Injectable({
  providedIn: 'root',
})
export class ComicVineService {
  apiUrl: string = '';

  constructor(private http: HttpClient, private environmentService: EnvironmentService) {
    this.apiUrl = this.environmentService.settings?.restUrl!;
  }

  // Search for series from Comic Vine
  searchSeries(query: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/series/search-comic-vine?query=${encodeURIComponent(query)}`);
  }

  // Search for issues from Comic Vine for a specific series
  searchIssues(seriesId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/series/${seriesId}/search-comic-vine`);
  }

  getSeriesById(seriesId: string): Observable<ComicVineSeriesDto> {
    return this.http.get<ComicVineSeriesDto>(`${this.apiUrl}/series/get-comic-vine/${seriesId}`);
  }

  getIssueById(issueId: string): Observable<Issue> {
    return this.http.get<any>(`${this.apiUrl}/issues/get-comic-vine/${issueId}`);
  }
}