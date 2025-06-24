import { RoomUserStatus } from "../../enums/room-user-status.enum";

export class JoinRoomResponse {
    userId?: string;
    roomId?: string;
    roomUserStatus?: RoomUserStatus;
    points?: number;
  
    constructor(serverResult?: any) {
      if (serverResult) {
        this.userId = serverResult.userId;
        this.roomId = serverResult.roomId;
        this.roomUserStatus = serverResult.roomUserStatus;
        this.points = serverResult.points;
      }
    }
  }
  