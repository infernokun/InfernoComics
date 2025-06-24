import { TestBed } from '@angular/core/testing';

import { RemoteServerStatsService } from './remote-server-stats.service';

describe('RemoteServerStatsService', () => {
  let service: RemoteServerStatsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RemoteServerStatsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
