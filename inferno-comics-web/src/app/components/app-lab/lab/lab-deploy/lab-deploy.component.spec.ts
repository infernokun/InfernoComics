import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LabDeployComponent } from './lab-deploy.component';

describe('LabDeployComponent', () => {
  let component: LabDeployComponent;
  let fixture: ComponentFixture<LabDeployComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [LabDeployComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LabDeployComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
