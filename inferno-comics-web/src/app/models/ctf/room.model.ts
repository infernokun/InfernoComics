import { SimpleFormData, TextQuestion } from "../simple-form-data.model";
import { StoredObject } from "../stored-object.model";

export class Room extends StoredObject {
  name?: string = '';
  creator?: string = '';
  facilitators?: string[] = [];
  surroundTag?: string = '';

  constructor(serverResult?: any) {
    super(serverResult);

    if (serverResult) {
      this.name = serverResult.name;
      this.creator = serverResult.creator;
      this.facilitators = serverResult.facilitators;
      this.surroundTag = serverResult.surroundTag;
    }
  }
}

export class RoomFormData extends SimpleFormData {
  constructor(
    updateResultsCB: Function = (k: any, v: any) => { }
  ) {
    super('room');

    this.questions.push(
      new TextQuestion({
        label: 'Name',
        key: 'name',
      }),
      new TextQuestion({
        label: 'SurroundTag',
        key: 'surroundTag',
      }),
    );

    this.questions.forEach((question) => (question.cb = updateResultsCB));
  }
}
