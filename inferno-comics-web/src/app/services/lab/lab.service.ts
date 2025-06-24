import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { BehaviorSubject, map, Observable } from 'rxjs';
import { ApiResponse } from '../../models/api-response.model';
import { BaseService } from '../base.service';
import { EnvironmentService } from '../environment.service';
import { LabRequest } from '../../models/dto/lab-request.model';
import { LabActionResult } from '../../models/lab/lab-action-result.model';
import { Lab } from '../../models/lab/lab.model';

const httpOptions = {
  headers: new HttpHeaders({
    'Content-Type': 'application/json',
  }),
};

@Injectable({
  providedIn: 'root'
})
export class LabService extends BaseService {
  private labsSubject = new BehaviorSubject<Lab[] | undefined>(undefined);
  labs$: Observable<Lab[] | undefined> = this.labsSubject.asObservable();

  private labsFetched = false;

  constructor(
    protected httpClient: HttpClient,
    private environmentService: EnvironmentService) {
    super(httpClient);
  }

  setLabs(labs: Lab[]): void {
    this.labsSubject.next(labs);
  }

  addNewLab(lab: Lab): void {
    if (!this.labsSubject.value) return;

    const updatedLabs = [...this.labsSubject.value, lab];
    this.labsSubject.next(updatedLabs);
  }

  removeLab(lab: Lab): void {
    if (!this.labsSubject.value) return;

    const updatedLabs = this.labsSubject.value.filter(l => l.id !== lab.id);
    this.labsSubject.next(updatedLabs);
  }

  fetchLabs(): void {
    // Only fetch if not already fetched or force refresh is needed
    if (!this.labsFetched) {
      this.get<ApiResponse<Lab[]>>(`${this.environmentService.settings?.restUrl}/labs`)
        .pipe(
          map(response => response.data.map(lab => new Lab(lab))
            .sort((a, b) => a.name!.localeCompare(b.name!)))
        )
        .subscribe({
          next: labs => {
            this.labsSubject.next(labs);
            this.labsFetched = true;
          },
          error: error => {
            console.error('Failed to fetch labs:', error);
            // Reset flag to allow retrying
            this.labsFetched = false;
          }
        });
    }
  }

  refreshLabs(): void {
    this.labsFetched = false;
    this.fetchLabs();
  }

  getLabById(labId: string): Observable<Lab> {
    return this.get<ApiResponse<Lab>>(this.environmentService.settings?.restUrl + '/labs/' + labId)
      .pipe(
        map((response: ApiResponse<Lab>) => new Lab(response.data))
      );
  }

  startLab(labRequest: LabRequest): Observable<ApiResponse<any>> {
    return this.post<ApiResponse<LabActionResult>>(this.environmentService.settings?.restUrl + '/labs/start',
      labRequest
    );
  }

  stopLab(labRequest: LabRequest): Observable<ApiResponse<any>> {
    return this.post<ApiResponse<any>>(this.environmentService.settings?.restUrl + '/labs/stop',
      labRequest);
  }

  createNewLab(lab: Lab, remoteServerId: string): Observable<ApiResponse<Lab>> {
    const httpOptions = {
      params: new HttpParams().set('remoteServerId', remoteServerId),
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    };
    const params = new HttpParams().set('remoteServerId', remoteServerId);
    return this.post<ApiResponse<Lab>>(this.environmentService.settings?.restUrl + '/labs', lab, httpOptions
    )
  }

  deleteLab(labRequest: LabRequest): Observable<ApiResponse<any>> {
    return this.post<ApiResponse<any>>(this.environmentService.settings?.restUrl + '/labs/delete',
      labRequest
    );
  }

  uploadDockerComposeFile(labId: string, content: string): Observable<ApiResponse<string>> {
    return this.post<ApiResponse<string>>(this.environmentService.settings?.restUrl + '/labs/upload/' + labId,
      content
    );
  }

  validateDockerComposeFile(content: string): Observable<ApiResponse<boolean>> {
    return this.post<ApiResponse<boolean>>(this.environmentService.settings?.restUrl + '/labs/validate',
      content
    );
  }

  getLabReadiness(labId: string): Observable<ApiResponse<boolean>> {
    return this.get<ApiResponse<boolean>>(this.environmentService.settings?.restUrl + '/labs/check/' + labId);
  }

  viewLogs(labId: string): Observable<ApiResponse<any>> {
    return this.get<ApiResponse<any>>(this.environmentService.settings?.restUrl + '/labs/logs/' + labId);
  }

  getSettings(labId: string, remoteServerId: string): Observable<ApiResponse<any>> {
    return this.get<ApiResponse<any>>(this.environmentService.settings?.restUrl + '/labs/settings/' + labId + '/' + remoteServerId);
  }

  deleteLabItem(labId: string) {
    return this.delete<ApiResponse<boolean>>(this.environmentService.settings?.restUrl + '/labs/delete-item/' + labId);
  }

  clear(teamId: string): Observable<ApiResponse<any>> {
    return this.post<ApiResponse<any>>(this.environmentService.settings?.restUrl + '/labs/dev', {
      teamId
    });
  }
}
