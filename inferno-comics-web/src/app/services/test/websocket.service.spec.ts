import { TestBed } from '@angular/core/testing';
import { WebsocketService } from '../websocket.service';
import { EnvironmentService } from '../environment.service';

describe('WebsocketService', () => {
  let service: WebsocketService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        WebsocketService,
        {
          provide: EnvironmentService,
          useValue: {
            settings: {
              websocketUrl: 'ws://localhost:8080'
            }
          }
        }
      ]
    });
    service = TestBed.inject(WebsocketService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});