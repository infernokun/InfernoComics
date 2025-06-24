import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
import { EnvironmentService } from './environment.service';
import { Router } from '@angular/router';
import { LoginResponse } from '../models/dto/login-response.model';

@Injectable({
  providedIn: 'root'
})
export class LoginService {
  
  constructor(
    private environmentService: EnvironmentService,
    private http: HttpClient,
    private router: Router
  ) { }

  // Use getters to evaluate URLs at runtime when settings are available
  private get loginUrl(): string {
    return `${this.environmentService.settings?.restUrl}/auth/login`;
  }

  private get registerUrl(): string {
    return `${this.environmentService.settings?.restUrl}/auth/register`;
  }

  private get refreshUrl(): string {
    return `${this.environmentService.settings?.restUrl}/auth/refresh`;
  }

  private get validateRefreshUrl(): string {
    return `${this.environmentService.settings?.restUrl}/auth/refresh/validate`;
  }

  private get logoutUrl(): string {
    return `${this.environmentService.settings?.restUrl}/auth/logout`;
  }

  login(username: string, password: string): Observable<ApiResponse<LoginResponse>> {
    return this.http.post<ApiResponse<LoginResponse>>(this.loginUrl, {
      username,
      password
    });
  }

  register(username: string, password: string): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(this.registerUrl, {
      username,
      password
    });
  }

  refreshToken(refreshToken: string): Observable<ApiResponse<LoginResponse>> {
    console.log('Refresh URL:', this.refreshUrl); // Debug log
    return this.http.post<ApiResponse<LoginResponse>>(this.refreshUrl, {
      refreshToken
    });
  }

  validateRefreshToken(refreshToken: string): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(this.validateRefreshUrl, {
      refreshToken
    });
  }

  logout(refreshToken: string): Observable<ApiResponse<string>> {
    return this.http.post<ApiResponse<string>>(this.logoutUrl, {
      refreshToken
    });
  }
}