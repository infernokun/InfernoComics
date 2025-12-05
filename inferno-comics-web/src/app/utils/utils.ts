import { EnvironmentService } from '../services/environment/environment.service';

export function dev_log(env: EnvironmentService, ...message: any[]) {
  if (env.settings?.production === false) {
    console.log(...message);
  }
}
