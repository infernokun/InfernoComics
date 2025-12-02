import { TestBed } from '@angular/core/testing';

import { EditDialogService } from './edit-dialog.service';

describe('EditDialogService', () => {
  let service: EditDialogService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EditDialogService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
