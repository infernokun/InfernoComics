import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Series } from '../models/series.model';
import { ComicVineSeries } from '../models/comic-vine.model';
import { EnvironmentService } from './environment.service';

@Injectable({
  providedIn: 'root'
})
export class SeriesService {
  private apiUrl: string = '';

  constructor(private http: HttpClient, private environmentService: EnvironmentService) {
    this.apiUrl = `${this.environmentService.settings?.restUrl}/series`;
  }

  getAllSeries(): Observable<Series[]> {
    return this.http.get<Series[]>(this.apiUrl);
  }

  getSeriesById(id: number): Observable<Series> {
    return this.http.get<Series>(`${this.apiUrl}/${id}`);
  }

  searchSeries(name: string): Observable<Series[]> {
    return this.http.get<Series[]>(`${this.apiUrl}/search?name=${name}`);
  }

  searchComicVineSeries(query: string): Observable<ComicVineSeries[]> {
    return this.http.get<ComicVineSeries[]>(`${this.apiUrl}/search-comic-vine?query=${query}`);
  }

  createSeries(series: Series): Observable<Series> {
    return this.http.post<Series>(this.apiUrl, series);
  }

  updateSeries(id: number, series: Series): Observable<Series> {
    return this.http.put<Series>(`${this.apiUrl}/${id}`, series);
  }

  deleteSeries(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}