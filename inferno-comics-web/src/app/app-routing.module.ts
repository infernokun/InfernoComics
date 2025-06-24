import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { AuditLogComponent } from './components/audit-log/audit-log.component';
import { TeamAuditLogComponent } from './components/app-lab/team-audit-log/team-audit-log.component';
import { CodeBlockComponent } from './components/common/code-block/code-block.component';
import { RemoteServerComponent } from './components/app-lab/remote-server/remote-server.component';
import { LabSettingsComponent } from './components/app-lab/lab-settings/lab-settings.component';
import { UsersComponent } from './components/users/users.component';
import { AppInitGuard } from './guards/app-init.guard';
import { TeamsComponent } from './components/teams/teams.component';
import { CTFMainComponent } from './components/app-ctf/ctf/ctf-main/ctf-main.component';
import { authGuard, homeAuthGuard } from './guards/auth.guard';
import { VMLabBuilderComponent } from './components/app-lab/vm-lab-builder/vm-lab-builder.component';
import { InitializationComponent } from './components/initialization/initialization.component';
import { RoomComponent } from './components/app-ctf/room/room.component';

const routes: Routes = [
  { path: 'challenges', component: RoomComponent, canActivate: [AppInitGuard, authGuard] },
  { path: 'room/:room', component: CTFMainComponent, canActivate: [AppInitGuard, authGuard] },
  { path: 'vm-lab-builder', component: VMLabBuilderComponent, canActivate: [AppInitGuard, authGuard] },
  { path: 'teams', component: TeamsComponent, canActivate: [AppInitGuard, authGuard] },
  { path: 'users', component: UsersComponent, canActivate: [AppInitGuard, authGuard] },
  { path: 'lab/settings/:name', component: LabSettingsComponent, canActivate: [AppInitGuard, authGuard] },
  { path: 'remote-server', component: RemoteServerComponent, canActivate: [AppInitGuard, authGuard] },
  { path: 'code', component: CodeBlockComponent, canActivate: [AppInitGuard, authGuard] },
  { path: 'team-log', component: TeamAuditLogComponent, canActivate: [AppInitGuard, authGuard] },
  { path: 'log', component: AuditLogComponent, canActivate: [AppInitGuard, authGuard] },
  { path: 'home', component: HomeComponent, canActivate: [AppInitGuard, homeAuthGuard] },
  { path: 'init', component: InitializationComponent },
  {
    path: '',
    redirectTo: '/home', // Will be redirected to home if initialized
    pathMatch: 'full',
  },
  { path: '**', redirectTo: '' } // Wildcard route for a 404 page, redirect to root
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
