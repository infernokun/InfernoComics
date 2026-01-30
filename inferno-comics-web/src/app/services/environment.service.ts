import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BaseService } from './base.service';
import { BehaviorSubject, Observable } from 'rxjs';

export interface EnvironmentSettings {
  production: boolean;
  baseUrl: string;
  restUrl: string;
  baseEndPoint: string;
  websocketUrl: string;
}
@Injectable({
  providedIn: 'root',
})
export class EnvironmentService extends BaseService {
  
  constructor(protected override http: HttpClient) {
    super(http);
  }

  configUrl = 'assets/environment/app.config.json';
  private configSettings: EnvironmentSettings | undefined = undefined;

  get settings() {
    return this.configSettings;
  }

  public load(): Promise<any> {
    return new Promise((resolve, reject) => {
      this.get<EnvironmentSettings>(this.configUrl).subscribe(
        (response: EnvironmentSettings) => {
          this.configSettings = response;
          resolve(true);
        }
      );
    }).catch((err: any) => {
      console.log('Error reading configuration file: ', err);
    });
  }
}
