import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';

platformBrowserDynamic()
  .bootstrapModule(AppModule, {
    ngZoneEventCoalescing: true,
  })
  .catch((err) => console.error(err));

(window as any).MonacoEnvironment = {
  getWorkerUrl: function (_moduleId: any, label: any) {
    return '/assets/monaco-editor/min/vs/base/worker/workerMain.js';
  },
};

const originalConsoleError = console.error;
console.error = function (...args: any[]) {
  if (args[1] && args[1].toString().includes("L is null")) {
    return; // Suppress the Monaco bug message
  }
  originalConsoleError.apply(console, args);
};