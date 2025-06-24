import { TestBed } from '@angular/core/testing';

import { RemoteServerService } from './remote-server.service';

describe('RemoteServerService', () => {
  let service: RemoteServerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RemoteServerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
