import { Component, OnInit } from '@angular/core';
import { TeamService } from '../../services/team.service';
import { Team, TeamFormData } from '../../models/team.model';
import { EditDialogService } from '../../services/edit-dialog.service';
import { AuthService } from '../../services/auth.service';
import { ApiResponse } from '../../models/api-response.model';
import { BehaviorSubject, Observable, take } from 'rxjs';
import { User } from '../../models/user.model';

@Component({
  selector: 'amaterasu-teams',
  templateUrl: './teams.component.html',
  styleUrl: './teams.component.scss',
  standalone: false
})
export class TeamsComponent implements OnInit {
  teams: Team[] = [];
  busy = false;

  private loggedInUserSubject: BehaviorSubject<User | undefined> = new BehaviorSubject<User | undefined>(undefined);

  loggedInUser$: Observable<User | undefined> = this.loggedInUserSubject.asObservable();

  constructor(private teamService: TeamService,
    private editDialogService: EditDialogService,
    private authService: AuthService) { }

  ngOnInit(): void {
    this.loggedInUser$ = this.authService.user$;

    this.teamService.getAllTeams().subscribe((teams: any) => {
      console.log(teams);
      this.teams = teams;
    });
  }

  addTeam(): void {
    const teamFormData = new TeamFormData();

    this.editDialogService
      .openDialog<Team>(teamFormData, (team: Team) => {
        if (!team) return;
        this.busy = true;

        team = new Team(team);

        this.authService.user$.pipe(take(1)).subscribe(user => {
          if (!user) return;

          team.createdBy = user.username;
          console.log('teamFormData', teamFormData);

          this.teamService.createNewTeam(team).subscribe((teamResp: ApiResponse<Team>) => {
            this.busy = false;

            console.log('teamResp', teamResp);
            if (!teamResp.data) return;
            this.teams.push(new Team(teamResp.data));
          });
        });
      })
      .subscribe();
  }

}
