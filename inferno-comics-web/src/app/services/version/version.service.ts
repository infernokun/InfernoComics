import { HttpClient } from '@angular/common/http';
import { EnvironmentService } from '../environment/environment.service';
import { APP_VERSION } from '../../version';
import { forkJoin, map, Observable, of } from 'rxjs';
import { Injectable } from '@angular/core';

export interface AppVersion {
  name: string;
  version: string;
}

@Injectable({
  providedIn: 'root'
})
export class VersionService {
  private apiUrl: string = '';
  version: string = APP_VERSION;

  constructor(private http: HttpClient,private environmentService: EnvironmentService) {
    this.apiUrl = `${this.environmentService.settings?.restUrl}/version`;
  }

  getWebAppVersion(): AppVersion {
    return { name: 'inferno-comics-web', version: this.version };
  }

  getBackendAppVersions(): Observable<AppVersion[]> {
    return this.http.get<AppVersion[]>(this.apiUrl);
  }

  getRestAndRecog(): Observable<{
    rest: AppVersion;
    recog: AppVersion;
  }> {
    return this.getBackendAppVersions().pipe(
      map(arr => {
        const rest = arr.find(v => v.name.includes('rest'))!;
        const recog = arr.find(v => v.name.includes('recog'))!;
        return { rest, recog };
      })
    );
  }

  getAllVersions() {
    return forkJoin({
      web: of(this.getWebAppVersion()),
      backend: this.getRestAndRecog()
    });
  }
}
