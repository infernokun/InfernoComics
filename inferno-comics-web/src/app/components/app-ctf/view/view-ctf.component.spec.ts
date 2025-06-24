import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewCTFComponent } from './view-ctf.component';

describe('ViewCTFComponent', () => {
  let component: ViewCTFComponent;
  let fixture: ComponentFixture<ViewCTFComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ViewCTFComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ViewCTFComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});