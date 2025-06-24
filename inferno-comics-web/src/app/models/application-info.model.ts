import { SimpleFormData, TextAreaQuestion, TextQuestion } from "./simple-form-data.model";
import { StoredObject } from "./stored-object.model";

export class ApplicationInfo extends StoredObject {
  name: string = 'unknown';
  description: string = 'unknown';
  settings: string = '{}';

  constructor(serverResult?: any) {
    if (serverResult) {
      super(serverResult);
      this.name = serverResult.name;
      this.description = serverResult.description;
      this.settings = serverResult.settings;
    }
  }
}

export class ApplicationInfoFormData extends SimpleFormData {
  constructor(
    updateResultsCB: Function = (k: any, v: any) => { }
  ) {
    super('application-info');

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
      }),
      new TextAreaQuestion({
        label: "Settings",
        key: "settings"
      })
    );
    this.questions.forEach((e) => (e.cb = updateResultsCB));
  }
}
