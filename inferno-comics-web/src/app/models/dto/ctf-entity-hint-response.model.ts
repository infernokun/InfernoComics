import { Hint } from "../ctf/hint.model";
import { JoinRoomResponse } from "./join-room-response.model";

export class CTFEntityHintResponse {
    joinRoomResponse?: JoinRoomResponse;
    ctfEntiyId?: string;
    correct?: boolean;
    attempts?: number;
    solvedAt?: Date;
    lastAttemptAt?: Date;
    hintsUsed?: Hint[];
  
    constructor(serverResult?: any) {
      if (serverResult) {
        this.joinRoomResponse = serverResult.joinRoomResponse;
        this.ctfEntiyId = serverResult.ctfEntiyId;
        this.correct = serverResult.correct;
        this.attempts = serverResult.attempts;
        this.solvedAt =  serverResult.solvedAt ? new Date(serverResult.solvedAt) : undefined;
        this.lastAttemptAt = serverResult.lastAttemptAt ? new Date(serverResult.lastAttemptAt) : undefined;
        this.hintsUsed = serverResult.hintsUsed ? serverResult.hintsUsed : [];
      }
    }
  }
  