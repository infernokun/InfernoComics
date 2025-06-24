import { Injectable, OnDestroy } from '@angular/core';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { EnvironmentService } from './environment.service';
import { retry, Subject, Subscription } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class WebsocketService implements OnDestroy {
  private clientFacingSubject$: Subject<any> = new Subject<any>();
  private socket$: WebSocketSubject<any>;
  private webSocketSubscriber!: Subscription;


  constructor(private environmentService: EnvironmentService) {
    const wsUrl = `${this.environmentService.settings?.websocketUrl}/socket-handler/update`;
    this.socket$ = webSocket(wsUrl);

    this.webSocketSubscriber = this.socket$.pipe(
      retry({ delay: 5000 })
    ).subscribe({
      next: (message) => {
        if (this.environmentService.settings?.production === false) {
          console.log('Got socket message', message);
        }
        // Filter out heartbeat messages
        if (!(message && message.type && message.type === 'heartbeat')) {
          this.clientFacingSubject$.next(message);
        }
      },
      error: (e) => {
        console.error('WebSocket Error', e);
      }
    });
  }

  ngOnInit() { }

  ngOnDestroy(): void {
    this.disconnect();
  }

  public getMessage(): WebSocketSubject<any> {
    return this.socket$;
  }

  public getSubject(): Subject<any> {
    return this.clientFacingSubject$;
  }

  public disconnect(): void {
    if (this.socket$) {
      this.socket$.complete();
    }
  }
}
