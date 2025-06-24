import { Component, computed, OnDestroy, OnInit, signal } from '@angular/core';
import { AuthService } from '../../../../services/auth.service';
import { combineLatest, of, Subject, switchMap, takeUntil } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { RoomService } from '../../../../services/ctf/room.service';
import { RoomUserStatus } from '../../../../enums/room-user-status.enum';
import { Room } from '../../../../models/ctf/room.model';
import { ApiResponse } from '../../../../models/api-response.model';
import { JoinRoomResponse } from '../../../../models/dto/join-room-response.model';

@Component({
  selector: 'amaterasu-ctf-main',
  templateUrl: './ctf-main.component.html',
  styleUrl: './ctf-main.component.scss',
  standalone: false,
})
export class CTFMainComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  loading = signal(true);
  room = signal<Room | null>(null);
  roomUserStatus = signal<JoinRoomResponse | null>(null);
  error = signal<string | null>(null);
  roomId: string | null = null;

  isRoomJoined = computed(() => 
    this.roomUserStatus()?.roomUserStatus === RoomUserStatus.JOINED
  );

  constructor(
    private authService: AuthService,
    private roomService: RoomService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loading.set(true);
    
    this.route.params.pipe(
      switchMap(params => {
        this.roomId = params['room'];
        if (!this.roomId) {
          this.error.set('Invalid room ID');
          this.loading.set(false);
          return of(null);
        }
        
        this.error.set(null);
        
        return combineLatest([
          this.roomService.getRoomById(this.roomId),
          this.roomService.checkJoinable(this.authService.getUser()?.id!, [this.roomId])
        ]);
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (responses) => {
        if (!responses) return;
        
        const [roomResponse, joinStatusResponse] = responses;
        const joinStatus: ApiResponse<{ [roomId: string]: JoinRoomResponse }> | null = joinStatusResponse as any;
        
        if (roomResponse?.data) {
          this.room.set(roomResponse.data);
          this.roomService.setCurrentRoom(roomResponse.data);
        } else {
          this.error.set('Room not found');
        }

        if (joinStatus?.data) {
          console.log('Join status:', joinStatus.data);
          const status = joinStatus.data[this.roomId!];
          this.roomUserStatus.set(status || null);
          this.roomService.setCurrentRoomUser(status || null);
          //this.roomUserStatus.set(joinStatus.data.get(this.roomId!) || null);
        } else {
          this.error.set('Failed to check joinable status');
        }
        
        this.loading.set(false);
        console.log('Room loaded:', this.room(), joinStatus);
      },
      error: (error) => {
        this.loading.set(false);
        this.error.set('Failed to load room');
        console.error('Error loading room:', error);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  joinRoom(): void {
    if (!this.roomId || !this.authService.getUser()?.id) return;

    this.roomService.joinRoom(this.roomId, this.authService.getUser()!.id!)
      .subscribe((response: ApiResponse<JoinRoomResponse>) => {
        if (response?.data) {
          this.roomUserStatus.set(response.data);
          this.roomService.setCurrentRoomUser( response.data || null);
        }
      });
  }

  browseRooms(): void {
    this.router.navigate(['/challenges']);
  }

  addPoints(): void {
    if (!this.roomId || !this.authService.getUser()?.id) return;

    this.roomService.addPoints(this.roomId, this.authService.getUser()!.id!)
      .subscribe((response: ApiResponse<JoinRoomResponse>) => {
        if (response?.data) {
          this.roomUserStatus.set(response.data);
          this.roomService.setCurrentRoomUser(response.data || null);
        }
      });
  }
}