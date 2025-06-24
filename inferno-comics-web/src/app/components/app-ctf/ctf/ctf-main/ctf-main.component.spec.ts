import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CTFMainComponent } from './ctf-main.component';

describe('CtfMainComponent', () => {
  let component: CTFMainComponent;
  let fixture: ComponentFixture<CTFMainComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CTFMainComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(CTFMainComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
