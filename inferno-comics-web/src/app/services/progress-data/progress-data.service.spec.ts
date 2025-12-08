import { TestBed } from '@angular/core/testing';
import { ProgressDataService } from './progress-data.service';


describe('ProgressDataService', () => {
  let service: ProgressDataService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ProgressDataService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
