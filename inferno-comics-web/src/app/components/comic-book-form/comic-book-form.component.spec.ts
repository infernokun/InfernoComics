import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ComicBookFormComponent } from './comic-book-form.component';

describe('ComicBookFormComponent', () => {
  let component: ComicBookFormComponent;
  let fixture: ComponentFixture<ComicBookFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ComicBookFormComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ComicBookFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
