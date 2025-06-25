import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ComicBook } from '../models/comic-book.model';
import { ComicVineIssue } from '../models/comic-vine.model';
import { ComicBookRequest } from '../models/comic-book-request.model';
import { EnvironmentService } from './environment.service';

@Injectable({
  providedIn: 'root',
})
export class ComicBookService {
  private apiUrl: string = '';

  constructor(
    private http: HttpClient,
    private environmentService: EnvironmentService
  ) {
    this.apiUrl = `${this.environmentService.settings?.restUrl}/comic-books`;
  }

  getAllComicBooks(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  getComicBookById(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}`);
  }

  getComicBooksBySeries(seriesId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/series/${seriesId}`);
  }

  createComicBook(comicBook: any): Observable<any> {
    return this.http.post<any>(this.apiUrl, comicBook);
  }

  updateComicBook(id: number, comicBook: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${id}`, comicBook);
  }

  deleteComicBook(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/${id}`);
  }

  // Search methods
  searchComicBooks(query: string): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.apiUrl}/search?query=${encodeURIComponent(query)}`
    );
  }

  // Statistics methods
  getComicBookStats(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/stats`);
  }

  // Recent additions
  getRecentComicBooks(limit: number = 10): Observable<any[]> {
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
