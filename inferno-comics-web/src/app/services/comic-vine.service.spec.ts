import { TestBed } from '@angular/core/testing';

import { ComicVineService } from './comic-vine.service';

describe('ComicVineService', () => {
  let service: ComicVineService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ComicVineService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
