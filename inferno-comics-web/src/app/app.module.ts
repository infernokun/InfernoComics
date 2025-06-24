import { NgModule, inject, provideAppInitializer } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MaterialModule } from './material.module';
import { HomeComponent } from './components/home/home.component';
import { EnvironmentService } from './services/environment.service';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { LabComponent } from './components/app-lab/lab/lab.component';
import { CommonModule } from '@angular/common';
import { AuditLogComponent } from './components/audit-log/audit-log.component';
import { CommonDialogComponent } from './components/common/dialog/common-dialog/common-dialog.component';
import { BashColoringPipe } from './pipes/bash-coloring.pipe';
import { CodeBlockComponent } from './components/common/code-block/code-block.component';
import { CodeEditorModule, provideCodeEditor } from '@ngstack/code-editor';
import { RemoteServerComponent } from './components/app-lab/remote-server/remote-server.component';
import { DurationPipe } from './pipes/duration.pipe';
import { DialogQuestionComponent } from './components/common/dialog/dialog-question/dialog-question.component';
import { SkeletonRectComponent } from './components/common/skeleton-rect/skeleton-rect.component';
import { SkeletonDirective } from './directives/skeleton.directive';
import { LabSettingsComponent } from './components/app-lab/lab-settings/lab-settings.component';
import { DragnDropDirective } from './directives/dragndrop.directive';
import { LoginComponent } from './components/common/login/login.component';
import { RegisterComponent } from './components/common/register/register.component';
import { UsersComponent } from './components/users/users.component';
import { AppInitService } from './services/app-init.service';
import { TeamsComponent } from './components/teams/teams.component';
import { LabMainComponent } from './components/app-lab/lab/lab-main/lab-main.component';
import { LabDeployComponent } from './components/app-lab/lab/lab-deploy/lab-deploy.component';
import { AddDialogFormComponent } from './components/common/dialog/add-dialog-form/add-dialog-form.component';
import { SettingsConfigureComponent } from './components/app-lab/lab-settings/settings-configure/settings-configure.component';
import { ConfirmationDialogComponent } from './components/common/dialog/confirmation-dialog/confirmation-dialog.component';
import { AdminActionsComponent } from './admin/admin-actions.component';
import { AgGridAngular } from 'ag-grid-angular';
import { AuthInterceptor } from './services/auth/auth-interceptor.service';
import { CTFMainComponent } from './components/app-ctf/ctf/ctf-main/ctf-main.component';
import { CTFCardComponent } from './components/app-ctf/ctf/ctf-card/ctf-card.component';
import { VMLabBuilderComponent } from './components/app-lab/vm-lab-builder/vm-lab-builder.component';
import { InitializationComponent } from './components/initialization/initialization.component';
import { ViewCTFComponent } from './components/app-ctf/view/view-ctf.component';
import { RoomComponent } from './components/app-ctf/room/room.component';

export function init_app(environmentService: EnvironmentService, appInitService: AppInitService) {
  return () => {
    return environmentService.load().then(() => {
      console.log('🔧 Environment loaded successfully');

      if (!environmentService.settings?.restUrl) {
        console.error('🔧 Environment loaded but REST URL is still undefined!');
        throw new Error('Failed to load environment settings');
      }

      return appInitService.load(environmentService);
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
    HomeComponent,
    LabComponent,
    AuditLogComponent,
    CommonDialogComponent,
    CodeBlockComponent,
    BashColoringPipe,
    RemoteServerComponent,
    DurationPipe,
    DialogQuestionComponent,
    AddDialogFormComponent,
    SkeletonRectComponent,
    SkeletonDirective,
    LabSettingsComponent,
    DragnDropDirective,
    InitializationComponent,
    LoginComponent,
    RegisterComponent,
    UsersComponent,
    TeamsComponent,
    VMLabBuilderComponent,
    LabMainComponent,
    LabDeployComponent,
    SettingsConfigureComponent,
    ConfirmationDialogComponent,
    AdminActionsComponent,
    RoomComponent,
    CTFMainComponent,
    CTFCardComponent,
    ViewCTFComponent
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
      const initializerFn = (init_app)(inject(EnvironmentService), inject(AppInitService));
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
