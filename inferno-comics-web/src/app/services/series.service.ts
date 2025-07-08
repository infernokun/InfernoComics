import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Series } from '../models/series.model';
import { ComicVineSeries } from '../models/comic-vine.model';
import { EnvironmentService } from './environment.service';

@Injectable({
  providedIn: 'root',
})
export class SeriesService {
  private apiUrl: string = '';

  constructor(
    private http: HttpClient,
    private environmentService: EnvironmentService
  ) {
    this.apiUrl = `${this.environmentService.settings?.restUrl}/series`;
  }

  getAllSeries(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  getSeriesById(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}`);
  }

  createSeries(series: any): Observable<any> {
    return this.http.post<any>(this.apiUrl, series);
  }

  updateSeries(id: number, series: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${id}`, series);
  }

  deleteSeries(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/${id}`);
  }

  searchSeries(query: string): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.apiUrl}/search?query=${encodeURIComponent(query)}`
    );
  }

  // Comic Vine integration - for searching series when creating/editing
  searchComicVineSeries(query: string): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.apiUrl}/search-comic-vine?query=${encodeURIComponent(query)}`
    );
  }

  getSeriesStats(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/stats`);
  }

  getRecentSeries(limit: number = 10): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/recent?limit=${limit}`);
  }

  addComicByImage(seriesId: number, imageFile: File): Observable<any> {
    const formData = new FormData();
    formData.append('image', imageFile);

    return this.http.post<any>(
      `${this.apiUrl}/${seriesId}/add-comic-by-image`,
      formData
    );
  }
}
