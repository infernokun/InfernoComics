import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { BehaviorSubject, catchError, map, Observable, ReplaySubject, of } from "rxjs";
import { ApiResponse } from "../models/api-response.model";
import { ApplicationInfo } from "../models/application-info.model";
import { EnvironmentService } from "./environment.service";
import { BaseService } from "./base.service";

@Injectable({
  providedIn: 'root'
})
export class AppInitService extends BaseService {
  private hasLoadedInfo = false;
  private initializationCompleteSubject = new ReplaySubject<boolean>(1);
  public initializationComplete$ = this.initializationCompleteSubject.asObservable();

  initializedSubject$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  initialized$: Observable<boolean> = this.initializedSubject$.asObservable();
  applicationInfo$: BehaviorSubject<ApplicationInfo> = new BehaviorSubject<ApplicationInfo>(new ApplicationInfo({}));

  constructor(protected httpClient: HttpClient, private environmentService: EnvironmentService) {
    super(httpClient);
  }

  isInitialized(): Observable<boolean> {
    return this.initialized$;
  }

  getApplicationInfo(): Observable<ApplicationInfo> {
    return this.applicationInfo$.asObservable();
  }

  initializationCheck(): Observable<ApplicationInfo> {
    return this.get<ApiResponse<ApplicationInfo>>(this.environmentService.settings?.restUrl + '/application-info').pipe(
      map((response: ApiResponse<ApplicationInfo>) => new ApplicationInfo(response.data))
    );
  }

  load(environmentService: EnvironmentService): void {
    // Skip loading if we've already done it
    if (this.hasLoadedInfo) {
      return;
    }

    const url = environmentService.settings?.restUrl + '/application-info';
    console.log('Loading application info from: ', url);

    this.hasLoadedInfo = true; // Mark as loaded before the request to prevent race conditions

    this.get<ApiResponse<ApplicationInfo>>(url)
      .pipe(
        catchError((err: any) => {
          console.warn('Error reading configuration file: ', err.message);
          this.initializedSubject$.next(false);
          this.initializationCompleteSubject.next(true);
          this.initializationCompleteSubject.complete();
          return of({} as ApiResponse<ApplicationInfo>);
        },)
      )
      .subscribe({
        next: (response: ApiResponse<ApplicationInfo>) => {
          console.log('Received Application Info: ', response);
          if (response && response.data) {
            this.applicationInfo$.next(new ApplicationInfo(response.data));
            this.initializedSubject$.next(true);
          } else {
            console.warn('No application info found');
            this.initializedSubject$.next(false);
          }
          console.log('Initialization status: ', this.initializedSubject$.getValue());

          // Signal that initialization process is complete
          this.initializationCompleteSubject.next(true);
          this.initializationCompleteSubject.complete();
        }
      });
  }

  createApplicationInfo(applicationInfo: ApplicationInfo): Observable<ApiResponse<ApplicationInfo>> {
    return this.post<ApiResponse<ApplicationInfo>>(this.environmentService.settings?.restUrl + '/application-info', applicationInfo);
  }

  setInitialized(value: boolean): void {
    this.initializedSubject$.next(value);
  }
}
