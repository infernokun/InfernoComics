import { SimpleFormData, TextQuestion } from "./simple-form-data.model";
import { StoredObject } from "./stored-object.model";

export class Team extends StoredObject {
  name?: string;
  description?: string;
  teamActiveLabs?: string[];
  teamDeletedLabs?: string[];

  constructor(serverResult?: any) {
    if (serverResult) {
      super(serverResult);

      this.name = serverResult.name;
      this.description = serverResult.description;
      this.teamActiveLabs = serverResult.teamActiveLabs;
      this.teamDeletedLabs = serverResult.teamDeletedLabs;
    }
  }
}

export class TeamFormData extends SimpleFormData {
  constructor(
    updateResultsCB: Function = (k: any, v: any) => { }
  ) {
    super('team');

    this.preFilledData = new Map<string, string>([
    ]);

    this.questions.push(
      new TextQuestion({
        label: 'Name',
        key: 'name',
      }),
      new TextQuestion({
        label: 'Description',
        key: 'description',
      })
    );
    this.questions.forEach((e) => (e.cb = updateResultsCB));
  }
}
