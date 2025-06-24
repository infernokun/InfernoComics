import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AuthService } from '../../../services/auth.service';
import { BehaviorSubject, catchError, Observable, of, take, throwError, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiResponse } from '../../../models/api-response.model';
import { CTFEntity } from '../../../models/ctf/ctf-entity.model';
import { FlagAnswer } from '../../../models/ctf/flag-answer.model';
import { CTFService } from '../../../services/ctf/ctf.service';
import { User } from '../../../models/user.model';
import { Hint } from '../../../models/ctf/hint.model';
import { RoomService } from '../../../services/ctf/room.service';
import { JoinRoomResponse } from '../../../models/dto/join-room-response.model';
import { CTFEntityHintResponse } from '../../../models/dto/ctf-entity-hint-response.model';
import { CTFEntityAnswerResponse } from '../../../models/dto/answered-ctfentity-response.model';

@Component({
  selector: 'amaterasu-view-dialog',
  templateUrl: './view-ctf.component.html',
  styleUrl: './view-ctf.component.scss',
  standalone: false
})
export class ViewCTFComponent implements OnInit, OnDestroy {
  viewedChallenge!: CTFEntity;
  answer: string = '';

  // State management
  private destroy$ = new Subject<void>();
  private isAnswered = new BehaviorSubject<boolean>(false);
  isAnswered$: Observable<boolean> = this.isAnswered.asObservable();

  // Status and feedback
  statusMessage: string = '';
  statusType: 'success' | 'error' | 'warning' | 'info' = 'info';
  currentAttempts: number = 0;
  isLoading: boolean = false;

  roomUser: JoinRoomResponse | undefined;

  constructor(
    private ctfService: CTFService,
    private authService: AuthService,
    @Inject(MAT_DIALOG_DATA) public data: CTFEntity,
    private dialogRef: MatDialogRef<ViewCTFComponent>,
    private roomService: RoomService
  ) {
    this.viewedChallenge = { ...data };
    this.roomUser = this.roomService.getCurrentRoomUser();
  }

  ngOnInit(): void {
    this.checkExistingAnswer();

  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Check if the user has already answered this challenge
   */
  private checkExistingAnswer(): void {
    this.isLoading = true;

    this.ctfService.answerChallengeCheck(this.viewedChallenge, this.roomService.getCurrentRoom()?.id!)
      .pipe(
        takeUntil(this.destroy$),
        catchError((error: HttpErrorResponse) => {
          if (error.status === 404) {
            // No previous answer found - this is expected for new challenges
            return of({ data: null } as ApiResponse<any>);
          }

          // Handle other errors
          console.error('Error checking challenge status:', error);
          this.showStatus('Failed to load challenge status', 'error');
          return throwError(() => error);
        })
      )
      .subscribe({
        next: (response: ApiResponse<any>) => {
          this.isLoading = false;
          this.handleExistingAnswerResponse(response);
        },
        error: (error) => {
          this.isLoading = false;
          console.error('Unexpected error:', error);
          this.showStatus('An unexpected error occurred', 'error');
        }
      });
  }

  /**
   * Handle the response from checking existing answers
   */
  private handleExistingAnswerResponse(response: ApiResponse<any>): void {
    if (response.data) {
      this.currentAttempts = response.data.attempts || 0;

      if (response.data.correct === true) {
        // Challenge already completed successfully
        this.isAnswered.next(true);
        const answers: any[] = response.data.answers || [];
        this.answer = answers.length > 0 ? answers[answers.length - 1] : '';
        this.showStatus('Challenge already completed!', 'success');
      } else if (this.currentAttempts >= this.viewedChallenge.maxAttempts!) {
        // Max attempts reached without success
        this.isAnswered.next(true);
        this.showStatus(`Maximum attempts (${this.viewedChallenge.maxAttempts}) reached`, 'warning');
      } else if (this.currentAttempts > 0) {
        // Some attempts made but not completed
        this.showStatus(`${this.currentAttempts} of ${this.viewedChallenge.maxAttempts} attempts used`, 'info');
      }
    } else {
      // No previous attempts
      this.isAnswered.next(false);
      this.currentAttempts = 0;
    }
  }

  /**
   * Submit an answer for the challenge
   */
  checkAnswer(challenge: CTFEntity): void {
    if (!this.answer.trim()) {
      this.showStatus('Please enter an answer', 'error');
      return;
    }

    if (this.isAnswered.getValue()) {
      return; // Already answered
    }

    this.isLoading = true;
    this.statusMessage = ''; // Clear previous status

    this.authService.user$.pipe(
      take(1),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (user: User | undefined) => {
        if (!user || !user.id) {
          this.isLoading = false;
          this.showStatus('Authentication required', 'error');
          return;
        }
        this.submitAnswer(user.id, this.roomService.getCurrentRoomUser().roomId!, challenge);
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Auth error:', error);
        this.showStatus('Authentication error', 'error');
      }
    });
  }

  /**
   * Submit the answer to the server
   */
  private submitAnswer(userId: string, roomId: string, challenge: CTFEntity): void {
    const flag = FlagAnswer.create(this.answer.trim(), userId, roomId, challenge.id!);

    this.ctfService.answerChallenge(flag)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: ApiResponse<CTFEntityAnswerResponse>) => {
          this.isLoading = false;
          this.handleAnswerResponse(response);
        },
        error: (error: HttpErrorResponse) => {
          this.isLoading = false;
          console.error('Submit answer error:', error);

          if (error.status === 429) {
            this.showStatus('Too many requests. Please wait before trying again.', 'warning');
          } else if (error.status === 400) {
            this.showStatus('Invalid answer format', 'error');
          } else {
            this.showStatus('Failed to submit answer. Please try again.', 'error');
          }
        }
      });
  }

  /**
   * Handle the response from submitting an answer
   */
  private handleAnswerResponse(response: ApiResponse<CTFEntityAnswerResponse>): void {
    if (!response.data) {
      this.showStatus('Invalid response from server', 'error');
      return;
    }

    const { correct, attempts } = response.data;
    this.currentAttempts = attempts || 0;

    if (correct === true) {
      // Correct answer!
      this.isAnswered.next(true);
      this.showStatus('🎉 Correct! Challenge completed!', 'success');
      console.log('Challenge solved successfully!');
      this.roomService.setCurrentRoomUser(response.data?.joinRoomResponse!);
    } else if (this.currentAttempts >= this.viewedChallenge.maxAttempts!) {
      // Max attempts reached
      this.isAnswered.next(true);
      this.showStatus(`❌ Incorrect. Maximum attempts (${this.viewedChallenge.maxAttempts}) reached.`, 'warning');
      console.log('Max attempts reached');
    } else {
      // Incorrect but can try again
      const remaining = this.viewedChallenge.maxAttempts! - this.currentAttempts;
      this.showStatus(`❌ Incorrect answer. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`, 'error');
      console.log('Incorrect answer, attempts remaining:', remaining);
    }
  }

  /**
   * Show status message to user
   */
  private showStatus(message: string, type: 'success' | 'error' | 'warning' | 'info'): void {
    this.statusMessage = message;
    this.statusType = type;

    // Auto-clear certain types of messages
    if (type === 'info' || type === 'error') {
      setTimeout(() => {
        if (this.statusMessage === message) {
          this.statusMessage = '';
        }
      }, 5000);
    }
  }

  /**
   * Close the dialog
   */
  closeDialog(): void {
    this.dialogRef.close({
      answered: this.isAnswered.getValue(),
      attempts: this.currentAttempts
    });
  }

  /**
   * Handle form submission
   */
  onSubmit(event: Event): void {
    event.preventDefault();
    this.checkAnswer(this.viewedChallenge);
  }

  /**
   * Get remaining attempts
   */
  get remainingAttempts(): number {
    return Math.max(0, this.viewedChallenge.maxAttempts! - this.currentAttempts);
  }

  /**
   * Check if submit should be disabled
   */
  get isSubmitDisabled(): boolean {
    return this.isAnswered.getValue() || !this.answer.trim() || this.isLoading;
  }

  useHint(hint: Hint) {
    this.ctfService.useHint(hint?.id!, this.roomService.getCurrentRoom()?.id!, this.authService.getUser()?.id!, this.viewedChallenge.id!)
      .subscribe((response: ApiResponse<CTFEntityHintResponse>) => {
        console.log(response);
      })
  }

  canUseHint(hint: Hint): boolean {
    return this.roomUser?.points! > hint.cost!;
  }
}
