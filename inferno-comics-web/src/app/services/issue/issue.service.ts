import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { EnvironmentService } from '../environment/environment.service';
import { IssueRequest } from '../../models/issue.model';

@Injectable({
  providedIn: 'root',
})
export class IssueService {
  private apiUrl: string = '';

  constructor(private http: HttpClient, private environmentService: EnvironmentService) {
    this.apiUrl = `${this.environmentService.settings?.restUrl}/issues`;
  }

  getAllIssues(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  getIssueById(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}`);
  }

  getIssuesBySeries(seriesId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/series/${seriesId}`);
  }

  createIssue(issue: any, imageData?: File): Observable<any> {
    const formData = new FormData();
    
    // Create a Blob with application/json content type
    const issueBlob = new Blob([JSON.stringify(issue)], { type: 'application/json' });
    formData.append('issue', issueBlob);
    
    if (imageData) {
      formData.append('imageData', imageData, imageData.name);
    }
    return this.http.post<any>(this.apiUrl, formData);
  }

  createIssuesBulk(issues: any[]): Observable<any[]> {
    return this.http.post<any[]>(`${this.apiUrl}/bulk`, issues);
  }

  updateIssue(id: number, issue: IssueRequest, imageData?: File): Observable<any> {
    const formData = new FormData();
    
    // Create a Blob with application/json content type
    const issueBlob = new Blob([JSON.stringify(issue)], { type: 'application/json' });
    formData.append('issue', issueBlob);
    
    if (imageData) {
      formData.append('imageData', imageData, imageData.name);
    }
    
    return this.http.put<any>(`${this.apiUrl}/${id}`, formData);
  }

  deleteIssue(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/${id}`);
  }

  deleteIssuesBulk(issueIds: number[]): Observable<{successful: number, failed: number}> {
    return this.http.post<{successful: number, failed: number}>(`${this.apiUrl}/bulk-delete`, issueIds);
  }

  // Search methods
  searchIssues(query: string): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.apiUrl}/search?query=${encodeURIComponent(query)}`
    );
  }

  // Statistics methods
  getIssueStats(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/stats`);
  }

  // Recent additions
  getRecentIssues(limit: number = 10): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/recent?limit=${limit}`);
  }

  // Key issues
  getKeyIssues(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/key-issues`);
  }

  // Value calculations
  getTotalValue(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/total-value`);
  }
}
