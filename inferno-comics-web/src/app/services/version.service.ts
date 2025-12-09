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

  getRestAndRecog(): Observable<{ rest: AppVersion; recog: AppVersion }> {
    return this.getBackendAppVersions().pipe(
      map((arr: ApiResponse<AppVersion[]>) => {
        const rest: AppVersion = arr.data.find((v) => v.name.includes(AppName.REST))!;
        const recog: AppVersion = arr.data.find((v) => v.name.includes(AppName.RECOG))!;
        return { rest, recog };
      })
    );
  }

  getAllVersions() {
    return forkJoin({
      web: of(this.getWebAppVersion()),
      backend: this.getRestAndRecog(),
    });
  }
}
