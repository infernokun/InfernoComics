import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingsConfigureComponent } from './settings-configure.component';

describe('SettingsConfigureComponent', () => {
  let component: SettingsConfigureComponent;
  let fixture: ComponentFixture<SettingsConfigureComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SettingsConfigureComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SettingsConfigureComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
