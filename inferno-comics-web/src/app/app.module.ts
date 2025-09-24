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
import { AgGridAngular } from 'ag-grid-angular';
import { AuthInterceptor } from './services/auth/auth-interceptor.service';
import { ThemeService } from './services/theme.service';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);

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
    AppComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    ReactiveFormsModule,
    FormsModule,
    MaterialModule,
    CommonModule,
    AgGridAngular,
  ],
  providers: [
    EnvironmentService,
    ThemeService,
    provideAppInitializer(() => {
      const initializerFn = (init_app)(inject(EnvironmentService));
      return initializerFn();
    }),
    provideHttpClient(withInterceptorsFromDi()),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
