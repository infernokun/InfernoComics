import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { EnvironmentService } from '../environment.service';
import { BaseService } from '../base.service';
import { Observable, map } from 'rxjs';
import { ApiResponse } from '../../models/api-response.model';
import { RemoteServerStats } from '../../models/lab/remote-server-stats.model';

@Injectable({
  providedIn: 'root'
})
export class RemoteServerStatsService extends BaseService {

  constructor(
    protected httpClient: HttpClient,
    private environmentService: EnvironmentService
  ) {
    super(httpClient);
  }

  /**
   * Retrieves all remote server stats.
   */
  getAllStats(): Observable<RemoteServerStats[]> {
    const url = this.environmentService.settings?.restUrl + '/remote-server-stats';
    return this.get<ApiResponse<RemoteServerStats[]>>(url).pipe(
      map((response: ApiResponse<RemoteServerStats[]>) =>
        response.data.map(stats => new RemoteServerStats(stats))
      )
    );
  }

  /**
   * Retrieves stats by id.
   */
  getStatsById(statsId: string): Observable<ApiResponse<RemoteServerStats>> {
    const url = this.environmentService.settings?.restUrl + '/remote-server-stats/' + statsId;
    return this.get<ApiResponse<RemoteServerStats>>(url);
  }

  /**
   * Creates new remote server stats.
   */
  createStats(stats: RemoteServerStats): Observable<ApiResponse<RemoteServerStats>> {
    const url = this.environmentService.settings?.restUrl + '/remote-server-stats';
    return this.post<ApiResponse<RemoteServerStats>>(url, stats);
  }

  /**
   * Updates remote server stats.
   */
  updateStats(stats: RemoteServerStats): Observable<ApiResponse<RemoteServerStats>> {
    const url = this.environmentService.settings?.restUrl + '/remote-server-stats/' + stats.id;
    return this.put<ApiResponse<RemoteServerStats>>(url, stats);
  }

  /**
   * Deletes remote server stats by id.
   */
  deleteStats(statsId: string): Observable<ApiResponse<any>> {
    const url = this.environmentService.settings?.restUrl + '/remote-server-stats/' + statsId;
    return this.delete<ApiResponse<any>>(url);
  }
}
