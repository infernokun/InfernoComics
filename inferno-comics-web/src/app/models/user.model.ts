import { Role } from "../enums/role.enum";
import { DropDownQuestion, ObservableMap, RadioQuestion, SimpleFormData } from "./simple-form-data.model";
import { StoredObject } from "./stored-object.model";
import { Team } from "./team.model";

export class User extends StoredObject {
  username?: string;
  team?: Team;
  role?: Role;

  constructor(serverResult?: any) {
    if (serverResult) {
      super(serverResult);

      this.username = serverResult.username;
      this.team = serverResult.team;
      this.role = serverResult.role as Role;
    }
  }
}

export class UserFormData extends SimpleFormData {
  constructor(
    users: User[],
    updateResultsCB: Function = (k: any, v: any) => { },
    observables?: ObservableMap
  ) {
    super('user');

    this.questions.push(
      new DropDownQuestion({
        label: "User",
        key: "user",
        options: users.map(user => ({ key: user.username!, value: user.id!, disabled: false })),
      }),
      new RadioQuestion({
        label: 'Team',
        key: 'team',
        options2: [],
        asyncData: observables && observables['teams'] ? observables['teams'] : undefined
      })
    );
    this.questions.forEach((e) => (e.cb = updateResultsCB));
  }
}
