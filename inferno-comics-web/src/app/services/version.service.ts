import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map, forkJoin, of } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
import { APP_VERSION } from '../version';
import { BaseService } from './base.service';
import { EnvironmentService } from './environment.service';

export interface AppVersion {
  name: string;
  version: string;
}

export interface BackendVersions {
  rest: AppVersion | undefined;
  recog: AppVersion | undefined;
}

export interface FullVersions {
  web: AppVersion;
  backend: BackendVersions;
}

enum AppName {
  REST = 'rest',
  RECOG = 'recog'
}

@Injectable({
  providedIn: 'root',
})
export class VersionService extends BaseService {
  private apiUrl: string = '';
  version: string = APP_VERSION;

  constructor(
    override http: HttpClient,
    private environmentService: EnvironmentService
  ) {
    super(http);
    this.apiUrl = `${this.environmentService.settings?.restUrl}/version`;
  }

  getWebAppVersion(): AppVersion {
    return { name: 'inferno-comics-web', version: this.version };
  }

  getBackendAppVersions(): Observable<ApiResponse<AppVersion[]>> {
    return this.get<ApiResponse<AppVersion[]>>(this.apiUrl);
  }

  getRestAndRecog(): Observable<BackendVersions> {
    return this.getBackendAppVersions().pipe(
      map((response: ApiResponse<AppVersion[]>) => {
        if (!response.data) return {rest: {name: AppName.REST, version: "N/A"}, recog: {name: AppName.RECOG, version: "N/A"}};

        const rest: AppVersion | undefined = response.data.find((v) =>
          v.name.includes(AppName.REST)
        );
        const recog: AppVersion | undefined = response.data.find((v) =>
          v.name.includes(AppName.RECOG)
        );

        return { rest, recog };
      })
    );
  }

  getAllVersions(): Observable<ApiResponse<FullVersions>> {
    return forkJoin({
      web: of(this.getWebAppVersion()),
      backend: this.getRestAndRecog(),
    }).pipe(
      map((result) => {
        const fullVersions: FullVersions = {
          web: result.web,
          backend: result.backend
        };
        
        return new ApiResponse<FullVersions>({
          code: 200,
          message: 'Versions retrieved successfully',
          data: fullVersions,
          type: 4, // SUCCESS
          timeMs: 0
        });
      })
    );
  }
}
