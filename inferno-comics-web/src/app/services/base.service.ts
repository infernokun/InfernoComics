import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class BaseService {

  constructor(protected http: HttpClient) { }

  protected get<T>(url: string, options?: { headers?: HttpHeaders | { [header: string]: string | string[]; }; params?: HttpParams | { [param: string]: string | number | boolean | ReadonlyArray<string | number | boolean>; } }): Observable<T> {
    return this.makeRequest('GET', url, null, options);
  }

  protected post<T>(url: string, body: any | null, options?: { headers?: HttpHeaders | { [header: string]: string | string[]; }; }): Observable<T> {
    return this.makeRequest('POST', url, body, options);
  }

  protected put<T>(url: string, body: any | null, options?: { headers?: HttpHeaders | { [header: string]: string | string[]; }; params?: HttpParams | { [param: string]: string | string[] }; }): Observable<T> {
    return this.makeRequest('PUT', url, body, options);
  }

  protected delete<T>(url: string, options?: { headers?: HttpHeaders | { [header: string]: string | string[]; }; }): Observable<T> {
    return this.makeRequest('DELETE', url, null, options);
  }

  private makeRequest<T>(method: string, url: string, body: any | null, options?: { headers?: HttpHeaders | { [header: string]: string | string[]; }; }): Observable<T> {
    const requestOptions = {
      body: body,
      ...options
    };

    return this.http.request<T>(method, url, requestOptions).pipe(
      catchError((error: HttpErrorResponse) => {
        return throwError(() => error);
      })
    );
  }
}
