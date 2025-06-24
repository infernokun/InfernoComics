import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { BehaviorSubject, Observable, Subject, combineLatest, debounceTime, distinctUntilChanged, finalize, map, startWith, takeUntil } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormControl } from '@angular/forms';
import { ApiResponse } from '../../../models/api-response.model';
import { Room, RoomFormData } from '../../../models/ctf/room.model';
import { RoomService } from '../../../services/ctf/room.service';
import { EditDialogService } from '../../../services/edit-dialog.service';
import { AuthService } from '../../../services/auth.service';
import { RoomUserStatus } from '../../../enums/room-user-status.enum';
import { Router } from '@angular/router';
import { JoinRoomResponse } from '../../../models/dto/join-room-response.model';

@Component({
  selector: 'amaterasu-ctf-room',
  templateUrl: './room.component.html',
  styleUrls: ['./room.component.scss'],
  standalone: false
})
export class RoomComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly loadingSubject = new BehaviorSubject<boolean>(false);

  // Observables
  rooms$: Observable<Room[] | undefined>;
  filteredRooms$: Observable<Room[]> | undefined = undefined;
  isLoading$ = this.loadingSubject.asObservable();

  // Form controls
  searchControl = new FormControl('');

  // Component state
  readonly trackByRoomId = (index: number, room: Room): string => room.id || index.toString();

  joinableStatus = signal<Map<string, JoinRoomResponse>>(new Map());

  constructor(
    private roomService: RoomService,
    private editDialogService: EditDialogService,
    private snackBar: MatSnackBar,
    private authService: AuthService,
    private router: Router
  ) {
    this.rooms$ = this.roomService.rooms$;
    this.setupFilteredRooms();
  }

  ngOnInit(): void {
    this.loadRooms();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.loadingSubject.complete();
  }

  /**
   * Setup filtered rooms observable with search functionality
   */
  private setupFilteredRooms(): void {
    const search$ = this.searchControl.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
      distinctUntilChanged(),
      map(term => (term || '').toLowerCase().trim())
    );

    this.filteredRooms$ = combineLatest([
      this.rooms$,
      search$
    ]).pipe(
      map(([rooms, searchTerm]) => this.filterRooms(rooms || [], searchTerm)),
      takeUntil(this.destroy$)
    );
  }

  /**
   * Filter rooms based on search term
   */
  private filterRooms(rooms: Room[], searchTerm: string): Room[] {
    if (!searchTerm) {
      return rooms;
    }

    return rooms.filter(room =>
      room.name?.toLowerCase().includes(searchTerm) ||
      room.creator?.toLowerCase().includes(searchTerm) ||
      room.facilitators?.some(facilitator =>
        facilitator.toLowerCase().includes(searchTerm)
      ) ||
      room.surroundTag?.toLowerCase().includes(searchTerm)
    );
  }

  /**
   * Load all rooms from the server
   */
  loadRooms(): void {
    this.setLoading(true);


    this.roomService.getAllRooms()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.setLoading(false))
      )
      .subscribe({
        next: (response: ApiResponse<Room[]>) => this.handleRoomsLoaded(response),
        error: (error) => this.handleLoadRoomsError(error)
      });
  }

  /**
   * Handle successful rooms loading
   */
  private handleRoomsLoaded(response: ApiResponse<Room[]>): void {
    if (!response?.data) {
      console.warn('No room data received from server', response);
      this.roomService.addRooms([]);
      return;
    }

    try {
      // Convert server objects to Room instances if needed
      const rooms = Array.isArray(response.data)
        ? response.data.map(roomData => new Room(roomData))
        : [];

      this.roomService.addRooms(rooms);
      console.log(`Successfully loaded ${rooms.length} rooms`);

      if (rooms.length === 0) {
        this.showInfo('No rooms found. Create your first room to get started!');
      } else {
        this.roomService.checkJoinable(this.authService.getUser()?.id || '', rooms.map(room => room.id || ''))
          .subscribe((checkResponse: ApiResponse<Map<string, JoinRoomResponse>>) => {
            this.roomService.addRoomJoinables(checkResponse.data || new Map<string, JoinRoomResponse>());
            console.log('Joinable status checked:', checkResponse);
            const newMap = new Map(Object.entries(checkResponse.data));
            this.joinableStatus.set(newMap);
          });
      }
    } catch (error) {
      console.error('Error processing room data:', error);
      this.showError('Error processing room data. Please refresh the page.');
    }
  }

  isRoomJoined(roomId: string): boolean {
    return this.joinableStatus().get(roomId)?.roomUserStatus === RoomUserStatus.JOINED;
  }

  private handleLoadRoomsError(error: any): void {
    console.error('Failed to load rooms:', error);

    const errorMessage = this.getErrorMessage(error);
    this.showError(`Failed to load rooms: ${errorMessage}`);

    // Set empty array on error to prevent template issues
    this.roomService.addRooms([]);
  }

  createRoom(): void {
    if (this.loadingSubject.value) {
      this.showWarning('Please wait for the current operation to complete.');
      return;
    }

    try {
      const roomFormData = new RoomFormData();

      this.editDialogService
        .openDialog<Room>(roomFormData, this.handleRoomCreation.bind(this))
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          error: (error) => {
            console.error('Error with room creation dialog:', error);
            this.showError('Could not process room creation. Please try again.');
          }
        });
    } catch (error) {
      console.error('Error opening room creation dialog:', error);
      this.showError('Could not open room creation dialog. Please try again.');
    }
  }


  private handleRoomCreation(room: Room): void {
    if (!room) {
      console.warn('No room data provided for creation');
      return;
    }

    // Validate room data
    if (!room.name?.trim()) {
      this.showError('Room name is required.');
      return;
    }

    this.setLoading(true);

    this.roomService.createRoom(room)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.setLoading(false))
      )
      .subscribe({
        next: (response) => this.handleRoomCreated(response),
        error: (error) => this.handleCreateRoomError(error)
      });
  }

  private handleRoomCreated(response: ApiResponse<Room>): void {
    if (!response?.data) {
      this.showError('Room creation failed: No data returned from server.');
      return;
    }

    try {
      const newRoom = new Room(response.data);
      this.roomService.addNewRoom(newRoom);
      this.showSuccess(`Room "${newRoom.name}" successfully created!`);

      // Clear search to show the new room
      this.searchControl.setValue('');

      console.log('Room successfully created:', newRoom);
    } catch (error) {
      console.error('Error processing created room:', error);
      this.showError('Room was created but there was an error displaying it. Please refresh the page.');
    }
  }

  private handleCreateRoomError(error: any): void {
    console.error('Failed to create room:', error);

    const errorMessage = this.getErrorMessage(error);
    this.showError(`Failed to create room: ${errorMessage}`);
  }

  refreshRooms(): void {
    this.loadRooms();
  }

  clearSearch(): void {
    this.searchControl.setValue('');
  }

  private getErrorMessage(error: any): string {
    if (error?.error?.message) {
      return error.error.message;
    }
    if (error?.message) {
      return error.message;
    }
    if (error?.status === 0) {
      return 'Network connection error. Please check your internet connection.';
    }
    if (error?.status >= 500) {
      return 'Server error. Please try again later.';
    }
    if (error?.status === 404) {
      return 'Service not found. Please contact support.';
    }
    if (error?.status === 403) {
      return 'Access denied. Please check your permissions.';
    }
    return 'An unexpected error occurred. Please try again.';
  }


  private setLoading(loading: boolean): void {
    this.loadingSubject.next(loading);
  }

  private showSuccess(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 4000,
      panelClass: ['success-snackbar'],
      horizontalPosition: 'end',
      verticalPosition: 'top'
    });
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 6000,
      panelClass: ['error-snackbar'],
      horizontalPosition: 'end',
      verticalPosition: 'top'
    });
  }

  private showWarning(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 4000,
      panelClass: ['warning-snackbar'],
      horizontalPosition: 'end',
      verticalPosition: 'top'
    });
  }

  private showInfo(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      panelClass: ['info-snackbar'],
      horizontalPosition: 'end',
      verticalPosition: 'top'
    });
  }

  enterRoom(roomId: string): void {
    console.log('uhhh', this.joinableStatus)
    this.router.navigate(['/room/', roomId], {
      state: this.joinableStatus(),
    }).catch(error => {
      console.error('Error navigating to room:', error);
      this.showError('Failed to navigate to room. Please try again.');
    });
  }

  joinRoom(roomId: string, event: MouseEvent): void {
    if (!roomId) { return }
    console.log(`Joining room with ID: ${roomId}`);

    this.roomService.joinRoom(roomId, this.authService.getUser()?.id || '').subscribe((response: ApiResponse<JoinRoomResponse>) => {
      if (response?.data) {
        const { roomId, userId, roomUserStatus } = response.data;
        console.log(`Joined room ${response.data.roomId} as user ${response.data.userId} with status ${roomUserStatus}`);

        const newMap = new Map(this.joinableStatus());
        newMap.set(response.data.roomId!, response.data);
        this.joinableStatus.set(newMap);

        this.showSuccess(`Successfully joined room: ${roomId}`);
      }
      else {
        console.error('Join room response did not contain data:', response);
        this.showError('Failed to join room. Please try again.');
      }
    });
  }

  leaveRoom(roomId: string, event: MouseEvent) {
    if (!roomId) { return }
    console.log(`Leaving room with ID: ${roomId}`);

    this.roomService.leaveRoom(roomId, this.authService.getUser()?.id || '').subscribe((response: ApiResponse<JoinRoomResponse>) => {
      if (response?.data) {
        const { roomId, userId, roomUserStatus } = response.data;
        console.log(`Left room ${response.data.roomId} as user ${response.data.userId} with status ${roomUserStatus}`);

        const newMap = new Map(this.joinableStatus());
        newMap.set(response.data.roomId!, response.data);
        this.joinableStatus.set(newMap);

        this.showSuccess(`Successfully left room: ${roomId}`);
      }
      else {
        console.error('Leave room response did not contain data:', response);
        this.showError('Failed to leave room. Please try again.');
      }
    });
  }
}
