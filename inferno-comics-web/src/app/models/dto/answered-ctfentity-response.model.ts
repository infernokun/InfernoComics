import { CTFEntity } from "../ctf/ctf-entity.model";
import { FlagAnswer } from "../ctf/flag-answer.model";
import { StoredObject } from "../stored-object.model";
import { JoinRoomResponse } from "./join-room-response.model";

export class CTFEntityAnswerResponse extends StoredObject {
    ctfEntity?: CTFEntity;
    correct?: boolean;
    attempts?: number;
    answers?: FlagAnswer[];
    attemptTimes?: Date[];
    solvedAt?: Date;
    lastAttemptAt?: Date;
    score?: number;
    hintsUsed?: number;
    solveTimeSeconds?: number;
    joinRoomResponse?: JoinRoomResponse;
  
    constructor(serverResult?: any) {
        super(serverResult);
        
        if (serverResult) {
        super(serverResult);

            this.ctfEntity = serverResult.ctfEntity;
            this.correct = serverResult.correct;
            this.attempts = serverResult.attempts;
            this.answers = serverResult.answers;
            this.attemptTimes = serverResult.attemptTimes?.map((time: string) => new Date(time));
            this.solvedAt = serverResult.solvedAt ? new Date(serverResult.solvedAt) : undefined;
            this.lastAttemptAt = serverResult.lastAttemptAt ? new Date(serverResult.lastAttemptAt) : undefined;
            this.score = serverResult.score;
            this.hintsUsed = serverResult.hintsUsed;
            this.solveTimeSeconds = serverResult.solveTimeSeconds;
            this.joinRoomResponse = serverResult.joinRoomResponse;
        }
    }
}