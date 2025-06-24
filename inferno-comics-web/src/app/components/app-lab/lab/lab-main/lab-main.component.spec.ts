import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LabMainComponent } from './lab-main.component';

describe('LabMainComponent', () => {
  let component: LabMainComponent;
  let fixture: ComponentFixture<LabMainComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [LabMainComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LabMainComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
