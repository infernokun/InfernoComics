import { StoredObject } from "../stored-object.model";

export class Flag extends StoredObject {
  flag?: string;
  surroundWithTag?: boolean;
  caseSensitive?: boolean;
  weight?: number;

  constructor(serverResult?: any) {
    if (serverResult) {
      super(serverResult);
      this.flag = serverResult.flag;
      this.surroundWithTag = serverResult.surroundWithTag;
      this.caseSensitive = serverResult.caseSensitive;
      this.weight = serverResult.weight;
    }
  }
}
