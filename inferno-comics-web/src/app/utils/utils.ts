import { EnvironmentService } from '../services/environment/environment.service';

export function dev_log(env: EnvironmentService, ...message: any[]) {
  if (env.settings?.production === false) {
    console.log(...message);
  }
}

export function upperLower(enumValue: string): string {
  if (!enumValue) {
    return enumValue;
  }
  return enumValue.charAt(0).toUpperCase() + enumValue.slice(1);
}