import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SkeletonRectComponent } from './skeleton-rect.component';

describe('SkeletonRectComponent', () => {
  let component: SkeletonRectComponent;
  let fixture: ComponentFixture<SkeletonRectComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkeletonRectComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(SkeletonRectComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
