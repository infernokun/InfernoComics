import { User } from "../user.model";

export class LoginResponse {
  refreshToken?: string;
  accessToken?: string;
  user?: User;

  constructor(serverResult?: any) {
    if (serverResult) {
      this.refreshToken = serverResult.refreshToken;
      this.accessToken = serverResult.accessToken;
      this.user = serverResult.user ? new User(serverResult.user) : undefined;
    }
  }
}
