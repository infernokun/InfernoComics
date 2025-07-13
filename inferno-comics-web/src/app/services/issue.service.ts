import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { EnvironmentService } from './environment.service';

@Injectable({
  providedIn: 'root',
})
export class IssueService {
  private apiUrl: string = '';

  constructor(
    private http: HttpClient,
    private environmentService: EnvironmentService
  ) {
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

  createIssue(issue: any): Observable<any> {
    return this.http.post<any>(this.apiUrl, issue);
  }

  updateIssue(id: number, issue: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${id}`, issue);
  }

  deleteIssue(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/${id}`);
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
