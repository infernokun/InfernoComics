import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ComicBook } from '../models/comic-book.model';
import { ComicVineIssue } from '../models/comic-vine.model';
import { ComicBookRequest } from '../models/comic-book-request.model';
import { EnvironmentService } from './environment.service';

@Injectable({
  providedIn: 'root'
})
export class ComicBookService {
  private apiUrl: string = '';

  constructor(private http: HttpClient, private environmentService: EnvironmentService) {
    this.apiUrl = `${this.environmentService.settings?.restUrl}/comic-books`;
  }

  getAllComicBooks(): Observable<ComicBook[]> {
    return this.http.get<ComicBook[]>(this.apiUrl);
  }

  getComicBookById(id: number): Observable<ComicBook> {
    return this.http.get<ComicBook>(`${this.apiUrl}/${id}`);
  }

  getComicBooksBySeriesId(seriesId: number): Observable<ComicBook[]> {
    return this.http.get<ComicBook[]>(`${this.apiUrl}/series/${seriesId}`);
  }

  searchComicVineIssues(seriesId: number): Observable<ComicVineIssue[]> {
    return this.http.get<ComicVineIssue[]>(`${this.apiUrl}/series/${seriesId}/search-comic-vine`);
  }

  getKeyIssues(): Observable<ComicBook[]> {
    return this.http.get<ComicBook[]>(`${this.apiUrl}/key-issues`);
  }

  createComicBook(comicBook: ComicBookRequest): Observable<ComicBook> {
    return this.http.post<ComicBook>(this.apiUrl, comicBook);
  }

  updateComicBook(id: number, comicBook: ComicBookRequest): Observable<ComicBook> {
    return this.http.put<ComicBook>(`${this.apiUrl}/${id}`, comicBook);
  }

  deleteComicBook(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}