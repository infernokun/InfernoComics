import { Injectable, OnDestroy } from '@angular/core';
import {
  webSocket,
  WebSocketSubject,
  WebSocketSubjectConfig,
} from 'rxjs/webSocket';
import { Subject, Subscription, BehaviorSubject, retry } from 'rxjs';
import { EnvironmentService } from './environment.service';

@Injectable({ providedIn: 'root' })
export class WebsocketService<TIncoming = unknown, TOutgoing = unknown> implements OnDestroy {
  private readonly inbound$ = new Subject<TIncoming>();
  private readonly socket$: WebSocketSubject<TIncoming | TOutgoing>;

  private socketSubscription!: Subscription;

  private _connected = false;

  isConnected$ = new BehaviorSubject<boolean>(false);

  constructor(private readonly env: EnvironmentService) {
    const base = this.env.settings?.websocketUrl;
    if (!base) {
      throw new Error('WebSocket URL missing in EnvironmentService.');
    }

    const wsUrl = `${base}/socket-handler/update`;

    const cfg: WebSocketSubjectConfig<TIncoming | TOutgoing> = {
      url: wsUrl,
      openObserver: {
        next: () => {
          this._connected = true;
          this.isConnected$.next(true);
          if (this.env.settings?.production === false) {
            console.log('WebSocket opened');
          }
        },
      },
      closeObserver: {
        next: () => {
          this._connected = false;
          this.isConnected$.next(false);
          if (this.env.settings?.production === false) {
            console.log('WebSocket closed');
          }
        },
      },
    };

    this.socket$ = webSocket<TIncoming | TOutgoing>(cfg);

    this.socketSubscription = this.socket$
      .pipe(retry({ delay: 5000 }))
      .subscribe({
        next: (msg) => this.handleMessage(msg as TIncoming),
        error: (err) => console.error('WebSocket error', err),
      });
  }

  private handleMessage(message: TIncoming): void {
    if (this.env.settings?.production === false) {
      console.log('WebSocket ←', message);
    }

    const isHeartbeat =
      typeof message === 'object' &&
      message !== null &&
      'type' in (message as any) &&
      (message as any).type === 'heartbeat';

    if (!isHeartbeat) {
      this.inbound$.next(message);
    }
  }

  public get messages$(): Subject<TIncoming> {
    return this.inbound$;
  }

  public get rawSocket$(): WebSocketSubject<TIncoming | TOutgoing> {
    return this.socket$;
  }

  public get isConnected(): boolean {
    return this._connected;
  }

  public send(message: TOutgoing): void {
    if (this.env.settings?.production === false) {
      console.log('WebSocket →', message);
    }
    this.socket$.next(message);
  }

  public disconnect(): void {
    this.socket$.complete();
    this.socketSubscription?.unsubscribe();
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
