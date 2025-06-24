import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { EnvironmentService } from '../environment.service';
import { BaseService } from '../base.service';
import { BehaviorSubject, Observable, map } from 'rxjs';
import { ApiResponse } from '../../models/api-response.model';
import { ServerType } from '../../enums/server-type.enum';
import { RemoteServer } from '../../models/lab/remote-server.model';

@Injectable({
  providedIn: 'root'
})
export class RemoteServerService extends BaseService {
  constructor(protected httpClient: HttpClient, private environmentService: EnvironmentService) {
    super(httpClient);
  }

  private selectedRemoteServerSubject: BehaviorSubject<RemoteServer | undefined> = new BehaviorSubject<RemoteServer | undefined>(undefined);
  selectedRemoteServer$: Observable<RemoteServer | undefined> = this.selectedRemoteServerSubject.asObservable();

  private remoteServersSubject: BehaviorSubject<RemoteServer[]> = new BehaviorSubject<RemoteServer[]>([]);
  remoteServers$: Observable<RemoteServer[]> = this.remoteServersSubject.asObservable();

  setRemoteServers(remoteServers: RemoteServer[]): void {
    this.remoteServersSubject.next(remoteServers);
  }

  getRemoteServers(): RemoteServer[] {
    return this.remoteServersSubject.value!;

  }

  setSelectedRemoteServer(remoteServer: RemoteServer): void {
    this.selectedRemoteServerSubject.next(remoteServer);
  }

  getSelectedRemoteServer(): RemoteServer {
    return this.selectedRemoteServerSubject.value!;

  }

  getAllServers(): Observable<RemoteServer[]> {
    const url = this.environmentService.settings?.restUrl + '/remote-server';

    return this.get<ApiResponse<RemoteServer[]>>(url).pipe(
      map((response: ApiResponse<RemoteServer[]>) => {
        const servers = response.data.map(server => new RemoteServer(server));

        // Automatically set the first server as selected if not already set
        if (servers.length > 0 && !this.getSelectedRemoteServer()) {
          this.setSelectedRemoteServer(servers[0]);
        }

        return servers;
      })
    );
  }

  getRemoteServerByServerType(serverType: ServerType): Observable<RemoteServer[]> {
    return this.get<ApiResponse<RemoteServer[]>>(this.environmentService.settings?.restUrl + '/remote-server', { params: new HttpParams().set('serverType', serverType) })
      .pipe(
        map((response: ApiResponse<RemoteServer[]>) => response.data.map((remoteServer: RemoteServer) => new RemoteServer(remoteServer)))
      );
  }

  addServer(server: RemoteServer): Observable<ApiResponse<RemoteServer>> {
    const url = this.environmentService.settings?.restUrl + '/remote-server';
    return this.post<ApiResponse<RemoteServer>>(url, server);
  }

  updateServer(server: RemoteServer): Observable<ApiResponse<RemoteServer>> {
    const url = this.environmentService.settings?.restUrl + '/remote-server/' + server.id;
    return this.put<ApiResponse<RemoteServer>>(url, server);
  }

  deleteServer(serverId: string): Observable<ApiResponse<any>> {
    const url = this.environmentService.settings?.restUrl + '/remote-server/' + serverId;
    return this.delete<ApiResponse<any>>(url);
  }

  validateServer(server: RemoteServer): Observable<ApiResponse<boolean>> {
    const url = this.environmentService.settings?.restUrl + '/remote-server/validate';
    return this.post<ApiResponse<boolean>>(url, server);
  }
}
