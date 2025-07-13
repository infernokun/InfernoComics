import { TestBed } from '@angular/core/testing';

import { ComicBookService } from './issue.service';

describe('ComicBookService', () => {
  let service: ComicBookService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ComicBookService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
