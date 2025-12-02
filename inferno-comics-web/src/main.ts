import { provideZoneChangeDetection } from "@angular/core";
import { AppModule } from './app/app.module';
import { platformBrowser } from "@angular/platform-browser";

platformBrowser()
  .bootstrapModule(AppModule, { applicationProviders: [provideZoneChangeDetection({ eventCoalescing: true })], })
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