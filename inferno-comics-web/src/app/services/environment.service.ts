import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

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
export class EnvironmentService {
  constructor(private http: HttpClient) { }

  configUrl = 'assets/environment/app.config.json';
  private configSettings: EnvironmentSettings | undefined = undefined;

  get settings() {
    return this.configSettings;
  }

  public load(): Promise<any> {
    return new Promise((resolve, reject) => {
      this.http.get<EnvironmentSettings>(this.configUrl).subscribe((response: EnvironmentSettings) => {
        this.configSettings = response;
        resolve(true);
      });
    }).catch((err: any) => {
      console.log('Error reading configuration file: ', err);
    });
  }
}
