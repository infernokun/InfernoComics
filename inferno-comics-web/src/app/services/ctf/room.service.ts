import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { ApiResponse } from '../../models/api-response.model';
import { BaseService } from '../base.service';
import { Room } from '../../models/ctf/room.model';
import { EnvironmentService } from '../environment.service';
import { JoinRoomResponse } from '../../models/dto/join-room-response.model';


@Injectable({
  providedIn: 'root'
})
export class RoomService extends BaseService {
  private roomsSubject: BehaviorSubject<Room[] | undefined> = new BehaviorSubject<Room[] | undefined>(undefined);
  rooms$: Observable<Room[] | undefined> = this.roomsSubject.asObservable();

  private roomJoinableSubject: BehaviorSubject<Map<string, JoinRoomResponse> | undefined> = new BehaviorSubject<Map<string, JoinRoomResponse> | undefined>(undefined);
  roomJoinable$: Observable<Map<string, JoinRoomResponse> | undefined> = this.roomJoinableSubject.asObservable();

  private currentRoomUserSubject: BehaviorSubject<JoinRoomResponse | undefined> = new BehaviorSubject<JoinRoomResponse | undefined>(undefined);
  currentRoomUser$: Observable<JoinRoomResponse | undefined> = this.currentRoomUserSubject.asObservable();

  private currentRoomSubject: BehaviorSubject<Room | undefined> = new BehaviorSubject<Room | undefined>(undefined);
  currentRoom$: Observable<Room | undefined> = this.currentRoomSubject.asObservable();

  reqUrl: string = '';

  constructor(
    private httpClient: HttpClient,
    private environmentService: EnvironmentService) {
    super(httpClient);

    this.reqUrl = this.environmentService.settings?.restUrl + '/room';
  }

  getAllRooms(): Observable<ApiResponse<Room[]>> {
    return this.get<ApiResponse<Room[]>>(`${this.reqUrl}`);
  }

  getRoomById(roomId: string): Observable<ApiResponse<Room>> {
    return this.get<ApiResponse<Room>>(`${this.reqUrl}/by?id=${roomId}`);
  }

  createRoom(room: Room): Observable<ApiResponse<Room>> {
    return this.post<ApiResponse<Room>>(`${this.reqUrl}`, room);
  }

  joinRoom(roomId: string, userId: string): Observable<ApiResponse<JoinRoomResponse>> {
    return this.post<ApiResponse<JoinRoomResponse>>(`${this.reqUrl}/join/${roomId}/${userId}`, { });
  }

  leaveRoom(roomId: string, userId: string): Observable<ApiResponse<JoinRoomResponse>> {
    return this.post<ApiResponse<JoinRoomResponse>>(`${this.reqUrl}/leave/${roomId}/${userId}`, { });
  }

  checkJoinable(userId: string, roomIds: string[]): Observable<ApiResponse<Map<string, JoinRoomResponse>>> {
    return this.post<ApiResponse<Map<string, JoinRoomResponse>>>(`${this.reqUrl}/check-joinable`, { userId: userId, roomIds: roomIds });
  }

  addNewRoom(room: Room): void {
    const currentRooms = this.roomsSubject.value || [];
    this.roomsSubject.next([...currentRooms, room]);
  }

  addRooms(rooms: Room[]): void {
    this.roomsSubject.next(rooms || []);
  }

  addRoomJoinable(roomId: string, roomUserStatus: JoinRoomResponse): void {
    const currentJoinable = this.roomJoinableSubject.value || new Map<string, JoinRoomResponse>();
    currentJoinable.set(roomId, roomUserStatus);
    this.roomJoinableSubject.next(currentJoinable);
  }

  addRoomJoinables(roomJoinables: Map<string, JoinRoomResponse>): void {
    this.roomJoinableSubject.next(roomJoinables || new Map<string, JoinRoomResponse>());
  }

  addPoints(roomId: string, userId: string): Observable<ApiResponse<JoinRoomResponse>> {
    return this.post<ApiResponse<JoinRoomResponse>>(`${this.reqUrl}/add-points/${roomId}/${userId}`, { });
  }

  setCurrentRoomUser(roomUser: JoinRoomResponse): void {
    this.currentRoomUserSubject.next(roomUser);
  }

  getCurrentRoomUser(): JoinRoomResponse {
    if (!this.currentRoomUserSubject.value) {
      throw new Error('Current room user is not set');
    }

    return this.currentRoomUserSubject.value;
  }

  getCurrentRoom(): Room | undefined {
    return this.currentRoomSubject.value;
  }

  setCurrentRoom(room: Room): void {
    this.currentRoomSubject.next(room);
  }
}
