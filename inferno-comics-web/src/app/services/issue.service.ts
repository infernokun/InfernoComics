import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Issue, IssueRequest } from '../models/issue.model';
import { EnvironmentService } from './environment.service';

@Injectable({
  providedIn: 'root',
})
export class IssueService {
  private apiUrl: string = '';

  constructor(private http: HttpClient, private environmentService: EnvironmentService) {
    this.apiUrl = `${this.environmentService.settings?.restUrl}/issues`;
  }

  getAllIssues(): Observable<Issue[]> {
    return this.http.get<Issue[]>(this.apiUrl);
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

  searchIssues(query: string): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.apiUrl}/search?query=${encodeURIComponent(query)}`
    );
  }

  getIssueStats(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/stats`);
  }

  getRecentIssues(limit: number = 10): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/recent?limit=${limit}`);
  }

  getKeyIssues(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/key-issues`);
  }

  getTotalValue(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/total-value`);
  }
}
