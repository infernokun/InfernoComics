import { TestBed } from '@angular/core/testing';

import { LabTrackerService } from './lab-tracker.service';

describe('LabTrackerService', () => {
  let service: LabTrackerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LabTrackerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
