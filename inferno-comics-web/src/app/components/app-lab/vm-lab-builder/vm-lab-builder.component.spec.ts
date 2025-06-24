import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VMLabBuilderComponent } from './vm-lab-builder.component';

describe('VMLabBuilderComponent', () => {
  let component: VMLabBuilderComponent;
  let fixture: ComponentFixture<VMLabBuilderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VMLabBuilderComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(VMLabBuilderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
