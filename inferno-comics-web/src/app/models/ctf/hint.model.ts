import { StoredObject } from "../stored-object.model";
import { CTFEntity } from "./ctf-entity.model";

export class Hint extends StoredObject {
    hint?: string;
    orderIndex?: number;
    cost?: number;
    isUnlocked?: boolean;
    unlockAfterAttempts?: number;
    usedAt?: Date;
    pointsDeducted?: number;
    ctfEntity?: CTFEntity

  constructor(serverResult?: any) {
    if (serverResult) {
      super(serverResult);
        this.hint = serverResult.hint;
        this.orderIndex = serverResult.orderIndex;
        this.cost = serverResult.cost;
        this.isUnlocked = serverResult.isUnlocked;
        this.unlockAfterAttempts = serverResult.unlockAfterAttempts;
        this.usedAt = serverResult.usedAt ? new Date(serverResult.usedAt) : undefined;
        this.pointsDeducted = serverResult.pointsDeducted;
        this.ctfEntity = serverResult.ctfEntity ? new CTFEntity(serverResult.ctfEntity) : undefined;
    }
  }
}
