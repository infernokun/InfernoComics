export class FlagAnswer {
    flag?: string;
    userId?: string;
    roomId?: string;
    questionId?: string;

    constructor(serverResult: any) {
        this.flag = serverResult.flag;
        this.userId = serverResult.userId;
        this.roomId = serverResult.roomId;
        this.questionId = serverResult.questionId;
    }

    static create(flag: string, userId: string, roomId: string, questionId: string): FlagAnswer {
        return new FlagAnswer({
            flag,
            userId,
            roomId,
            questionId
        });
    }
}