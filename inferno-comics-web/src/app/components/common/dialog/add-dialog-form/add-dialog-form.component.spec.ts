import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AddDialogFormComponent } from './add-dialog-form.component';

describe('AddDialogFormComponent', () => {
  let component: AddDialogFormComponent;
  let fixture: ComponentFixture<AddDialogFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddDialogFormComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(AddDialogFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
