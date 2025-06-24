import { TestBed } from '@angular/core/testing';

import { LabDeploymentService } from './lab-deployment.service';

describe('LabDeploymentService', () => {
  let service: LabDeploymentService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LabDeploymentService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
