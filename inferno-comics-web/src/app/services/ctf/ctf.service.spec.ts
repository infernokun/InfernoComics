import { TestBed } from '@angular/core/testing';
import { CTFService } from './ctf.service';


describe('CTFService', () => {
  let service: CTFService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CTFService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
