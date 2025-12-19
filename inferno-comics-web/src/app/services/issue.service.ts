import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Issue, IssueRequest } from '../models/issue.model';
import { EnvironmentService } from './environment.service';
import { ApiResponse } from '../models/api-response.model';
import { BaseService } from './base.service';

@Injectable({
  providedIn: 'root',
})
export class IssueService extends BaseService {
  private apiUrl: string = '';

  constructor(
    protected override http: HttpClient,
    private environmentService: EnvironmentService
  ) {
    super(http);
    this.apiUrl = `${this.environmentService.settings?.restUrl}/issues`;
  }

  getAllIssues(): Observable<ApiResponse<Issue[]>> {
    return this.get<ApiResponse<Issue[]>>(this.apiUrl);
  }

  getIssueById(id: number): Observable<ApiResponse<Issue>> {
    return this.get<ApiResponse<Issue>>(`${this.apiUrl}/${id}`);
  }

  getIssuesBySeries(seriesId: number): Observable<ApiResponse<Issue[]>> {
    return this.get<ApiResponse<Issue[]>>(`${this.apiUrl}/series/${seriesId}`);
  }

  createIssue(issue: any, imageData?: File): Observable<ApiResponse<Issue>> {
    const formData = new FormData();

    // Create a Blob with application/json content type
    const issueBlob = new Blob([JSON.stringify(issue)], {
      type: 'application/json',
    });
    formData.append('issue', issueBlob);

    if (imageData) {
      formData.append('imageData', imageData, imageData.name);
    }
    return this.post<any>(this.apiUrl, formData);
  }

  createIssuesBulk(issues: any[]): Observable<ApiResponse<Issue[]>> {
    return this.post<ApiResponse<Issue[]>>(`${this.apiUrl}/bulk`, issues);
  }

  updateIssue(
    id: number,
    issue: IssueRequest,
    imageData?: File
  ): Observable<ApiResponse<Issue>> {
    const formData = new FormData();

    // Create a Blob with application/json content type
    const issueBlob = new Blob([JSON.stringify(issue)], {
      type: 'application/json',
    });
    formData.append('issue', issueBlob);

    if (imageData) {
      formData.append('imageData', imageData, imageData.name);
    }

    return this.put<ApiResponse<Issue>>(`${this.apiUrl}/${id}`, formData);
  }

  deleteIssue(id: number): Observable<any> {
    return this.delete<any>(`${this.apiUrl}/${id}`);
  }

  deleteIssuesBulk(issueIds: number[]): Observable<ApiResponse<{ successful: number; failed: number }>> {
    return this.post<ApiResponse<{ successful: number; failed: number }>>(
      `${this.apiUrl}/bulk-delete`,
      issueIds
    );
  }

  searchIssues(query: string): Observable<ApiResponse<Issue[]>> {
    return this.get<ApiResponse<Issue[]>>(
      `${this.apiUrl}/search?query=${encodeURIComponent(query)}`
    );
  }

  getIssueStats(): Observable<ApiResponse<any>> {
    return this.get<ApiResponse<any>>(`${this.apiUrl}/stats`);
  }

  getRecentIssues(limit: number = 10): Observable<ApiResponse<Issue[]>> {
    return this.get<ApiResponse<Issue[]>>(
      `${this.apiUrl}/recent?limit=${limit}`
    );
  }

  getKeyIssues(): Observable<ApiResponse<Issue[]>> {
    return this.get<ApiResponse<Issue[]>>(`${this.apiUrl}/key-issues`);
  }

  getTotalValueCurrent(): Observable<ApiResponse<number>> {
    return this.get<ApiResponse<number>>(
      `${this.apiUrl}/total-value?type=current`
    );
  }

  getTotalValuePurchase(): Observable<ApiResponse<number>> {
    return this.get<ApiResponse<number>>(
      `${this.apiUrl}/total-value?type=purchase`
    );
  }
}
