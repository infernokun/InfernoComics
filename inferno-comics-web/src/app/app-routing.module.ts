import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { IssuesMissingComponent } from './components/issues/issues-missing/issues-missing.component';
import { AdminComponent } from './components/admin/admin.component';
import { IssuesListComponent } from './components/issues/issues-list/issues-list.component';
import { SeriesAdminComponent } from './components/series/series-admin/series-admin.component';
import { SeriesDetailComponent } from './components/series/series-detail/series-detail.component';
import { SeriesFormComponent } from './components/series/series-form/series-form.component';
import { SeriesListComponent } from './components/series/series-list/series-list.component';
import { StatsComponent } from './components/stats/stats.component';

const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'admin', component: AdminComponent },
  { path: 'config', redirectTo: '/admin', pathMatch: 'full' },
  { path: 'series', component: SeriesListComponent },
  { path: 'missing', component: IssuesMissingComponent },
  { path: 'issues', component: IssuesListComponent },
  { path: 'stats', component: StatsComponent },
  { path: 'series/new', component: SeriesFormComponent },
  { path: 'series/:id/:slug', component: SeriesDetailComponent },
  { path: 'series/:id/:slug/edit', component: SeriesFormComponent },
  { path: 'series/:id/:slug/admin', component: SeriesAdminComponent },
  { path: '**', redirectTo: '/dashboard' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }