import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IssueFormComponent } from './issue-form.component';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ReactiveFormsModule } from '@angular/forms';

describe('IssueFormComponent', () => {
  let component: IssueFormComponent;
  let fixture: ComponentFixture<IssueFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        IssueFormComponent,
        MatDialogModule,
        ReactiveFormsModule
      ],
      providers: [
        { provide: MatDialogRef, useValue: {} }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(IssueFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});