import { NgModule, inject, provideAppInitializer } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MaterialModule } from './material.module';
import { EnvironmentService } from './services/environment.service';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { CodeEditorModule, provideCodeEditor } from '@ngstack/code-editor';
import { AppInitService } from './services/app-init.service';
import { AgGridAngular } from 'ag-grid-angular';
import { AuthInterceptor } from './services/auth/auth-interceptor.service';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { SeriesDetailComponent } from './components/series-detail/series-detail.component';
import { SeriesFormComponent } from './components/series-form/series-form.component';
import { SeriesListComponent } from './components/series-list/series-list.component';
import { ComicBookFormComponent } from './components/comic-book-form/comic-book-form.component';

export function init_app(environmentService: EnvironmentService) {
  return () => {
    return environmentService.load().then(() => {
      console.log('🔧 Environment loaded successfully');

      if (!environmentService.settings?.restUrl) {
        console.error('🔧 Environment loaded but REST URL is still undefined!');
        throw new Error('Failed to load environment settings');
      }
    }).then(() => {
      console.log('🔧 App initialization completed successfully');
    }).catch((error) => {
      console.error('🔧 App initialization failed:', error);
      throw error;
    });
  };
}

@NgModule({
  declarations: [
    AppComponent,
    SeriesListComponent,
    SeriesDetailComponent,
    ComicBookFormComponent,
    SeriesFormComponent,
    DashboardComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    ReactiveFormsModule,
    FormsModule,
    MaterialModule,
    CommonModule,
    CodeEditorModule,
    AgGridAngular,
  ],
  providers: [
    EnvironmentService,
    AppInitService,
    provideAppInitializer(() => {
      const initializerFn = (init_app)(inject(EnvironmentService));
      return initializerFn();
    }),
    provideHttpClient(withInterceptorsFromDi()),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true
    },
    provideCodeEditor({
      editorVersion: '0.44.0',
      baseUrl: '/assets/monaco-editor/min'
    })
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
