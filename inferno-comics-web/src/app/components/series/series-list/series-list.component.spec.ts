import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { SeriesListComponent } from './series-list.component';
import { MaterialModule } from '../../../material.module';
import { FormsModule } from '@angular/forms';
import { SlicePipe } from '@angular/common';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

// Mock ActivatedRoute
const mockActivatedRoute = {
  queryParams: jasmine.createSpy('queryParams').and.returnValue({}),
  params: jasmine.createSpy('params').and.returnValue({})
};

describe('SeriesListComponent', () => {
  let component: SeriesListComponent;
  let fixture: ComponentFixture<SeriesListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        SeriesListComponent,
        MaterialModule,
        FormsModule,
        RouterModule.forRoot([]),
        SlicePipe
      ],
      providers: [
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        provideAnimationsAsync()
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SeriesListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});