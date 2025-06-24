import { Component, OnInit } from '@angular/core';
import { RemoteServerService } from '../../../services/lab/remote-server.service';
import { EditDialogService } from '../../../services/edit-dialog.service';
import { AuthService } from '../../../services/auth.service';
import { ApiResponse } from '../../../models/api-response.model';
import { BehaviorSubject, Observable, take } from 'rxjs';
import { User } from '../../../models/user.model';
import { RemoteServer, RemoteServerFormData } from '../../../models/lab/remote-server.model';

@Component({
  selector: 'amaterasu-remote-server',
  templateUrl: './remote-server.component.html',
  styleUrls: ['./remote-server.component.scss'],
  standalone: false
})
export class RemoteServerComponent implements OnInit {
  remoteServers: RemoteServer[] = [];
  selectedServer?: RemoteServer;

  private loggedInUserSubject: BehaviorSubject<User | undefined> = new BehaviorSubject<User | undefined>(undefined);

  loggedInUser$: Observable<User | undefined> = this.loggedInUserSubject.asObservable();

  constructor(private remoteServerService: RemoteServerService,
    private editDialogService: EditDialogService,
    private authService: AuthService) { }

  ngOnInit(): void {
    this.loadRemoteServers();
    this.loggedInUser$ = this.authService.user$;
  }

  loadRemoteServers(): void {
    this.remoteServerService.getAllServers().subscribe({
      next: data => {
        this.remoteServers = data;
        // Optionally select first item
        if (this.remoteServers.length > 0) {
          this.selectedServer = this.remoteServers[0];
        }
      },
      error: err => console.error('Error loading remote servers', err)
    });
  }

  onSelectServer(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedServer = this.remoteServers.find(server => server.id === input.value);
  }

  addRemoteServer(): void {
    const remoteServerFormData = new RemoteServerFormData();

    this.editDialogService
      .openDialog<RemoteServer>(remoteServerFormData, (remoteServer: RemoteServer) => {
        this.authService.user$.pipe(take(1)).subscribe(user => {
          if (!user) return;

          remoteServer.createdBy = user.username;

          this.remoteServerService.addServer(remoteServer).subscribe((response: ApiResponse<RemoteServer>) => {
            if (!response.data) return;

            this.remoteServers.push(response.data);
            this.selectedServer = response.data;
          });
        });
      }).subscribe();
  }

  deleteRemoteServer(id: string): void {
    this.remoteServerService.deleteServer(id).subscribe(() => {
      this.remoteServers = this.remoteServers.filter(server => server.id !== id);
      this.selectedServer = this.remoteServers.length > 0 ? this.remoteServers[0] : undefined;
    });

  }
}
