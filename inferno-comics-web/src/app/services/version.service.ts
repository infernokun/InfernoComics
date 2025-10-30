import { HttpClient } from '@angular/common/http';
import { EnvironmentService } from './environment.service';
import { APP_VERSION } from '../version';
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

  /** Web‑app version (bundled) */
  getWebAppVersion(): AppVersion {
    return { name: 'inferno-comics-web', version: this.version };
  }

  /** Backend returns an array of two objects */
  getBackendAppVersions(): Observable<AppVersion[]> {
    return this.http.get<AppVersion[]>(this.apiUrl);
  }

  /** Split the array into two named objects */
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

  /** All three versions in one observable */
  getAllVersions() {
    return forkJoin({
      web: of(this.getWebAppVersion()),
      backend: this.getRestAndRecog()
    });
  }
}
