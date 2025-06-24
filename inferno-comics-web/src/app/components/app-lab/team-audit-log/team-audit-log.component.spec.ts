import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TeamAuditLogComponent } from './team-audit-log.component';

describe('TeamAuditLogComponent', () => {
  let component: TeamAuditLogComponent;
  let fixture: ComponentFixture<TeamAuditLogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TeamAuditLogComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(TeamAuditLogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
