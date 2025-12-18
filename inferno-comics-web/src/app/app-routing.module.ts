import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { SeriesListComponent } from './components/series-list/series-list.component';
import { SeriesDetailComponent } from './components/series-detail/series-detail.component';
import { SeriesFormComponent } from './components/series-form/series-form.component';
import { SeriesAdminComponent } from './components/series-admin/series-admin.component';
import { IssuesListComponent } from './components/issues-list/issues-list.component';
import { RecognitionConfigComponent } from './components/config/recognition-config.component';
import { MissingIssuesComponent } from './components/missing-issues/missing-issues.component';

const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'config', component: RecognitionConfigComponent },
  { path: 'series', component: SeriesListComponent },
  { path: 'missing', component: MissingIssuesComponent },
  { path: 'issues', component: IssuesListComponent },
  { path: 'series/new', component: SeriesFormComponent },
  { path: 'series/:id', component: SeriesDetailComponent },
  { path: 'series/:id/edit', component: SeriesFormComponent },
  { path: 'series/:id/admin', component: SeriesAdminComponent },
  { path: '**', redirectTo: '/dashboard' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }