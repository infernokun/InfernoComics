import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import {
  catchError,
  combineLatest,
  Observable,
  of,
  startWith,
  Subject,
  takeUntil,
} from 'rxjs';
import { LabType } from '../../../../enums/lab-type.enum';
import { User } from '../../../../models/user.model';
import { LabTrackerService } from '../../../../services/lab/lab-tracker.service';
import { LabService } from '../../../../services/lab/lab.service';
import { MatDialog } from '@angular/material/dialog';
import { RemoteServerService } from '../../../../services/lab/remote-server.service';
import { ApiResponse } from '../../../../models/api-response.model';
import { LabDeploymentService } from '../../../../services/lab/lab-deployment.service';
import { FADE_ANIMATION } from '../../../../utils/animations';
import { CommonDialogComponent } from '../../../common/dialog/common-dialog/common-dialog.component';
import { EditDialogService } from '../../../../services/edit-dialog.service';
import { getServerType } from '../../../../utils/server-lab-type';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ConfirmationDialogComponent } from '../../../common/dialog/confirmation-dialog/confirmation-dialog.component';
import { LabTracker } from '../../../../models/lab/lab-tracker.model';
import { Lab } from '../../../../models/lab/lab.model';
import { RemoteServer, RemoteServerSelectData } from '../../../../models/lab/remote-server.model';

@Component({
  selector: 'amaterasu-lab-main',
  standalone: false,
  templateUrl: './lab-main.component.html',
  styleUrl: './lab-main.component.scss',
  animations: [FADE_ANIMATION],
})
export class LabMainComponent implements OnInit, OnDestroy {
  readonly LabType = LabType;
  isHovered = false;

  // Observables for async pipe
  labs$: Observable<Lab[] | undefined>;
  labTrackers$: Observable<LabTracker[] | undefined> | undefined;
  isLoading$: Observable<boolean> | undefined;
  labsLoading$: Observable<Set<string>> | undefined;

  isLoading = true;

  // Private properties
  private labTrackers: LabTracker[] | undefined = undefined;
  private labs: Lab[] = [];
  private destroy$ = new Subject<void>();

  @Input() user: User | undefined;

  constructor(
    private labService: LabService,
    private labTrackerService: LabTrackerService,
    private dialog: MatDialog,
    private remoteServerService: RemoteServerService,
    private labDeploymentService: LabDeploymentService,
    private editDialogService: EditDialogService,
    private snackBar: MatSnackBar
  ) {
    this.labs$ = this.labService.labs$;
    this.labsLoading$ = this.labDeploymentService.labsLoading$;
    this.labTrackers$ = this.labTrackerService.labTrackersByTeam$;
  }

  ngOnInit(): void {
    this.setupSubscriptions();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupSubscriptions(): void {
    // Combine both observables to wait for both to emit
    combineLatest([
      this.labTrackerService.labTrackersByTeam$.pipe(startWith(null)),
      this.labs$.pipe(startWith(null)),
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([trackers, labs]) => {
        // Handle trackers
        this.labTrackers = trackers || [];

        // Handle labs
        if (labs) {
          this.labs = labs;
        }

        // Set loading to false only after both have emitted
        this.isLoading = false;
      });
  }

  deployLabStart(lab: Lab): void {
    if (!lab.id) return;
    this.labDeploymentService.startLabDeployment(lab);
  }

  dockerComposeUpload(event: Event, labId: string): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = (e: ProgressEvent<FileReader>) => {
      const content = e.target?.result as string;
      if (!content) return;

      this.labService
        .uploadDockerComposeFile(labId, content)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (res: ApiResponse<string>) => {
            // Handle success
            console.log('Upload successful:', res);
          },
          error: (err) => {
            // Handle error
            console.error('Upload failed:', err);
          },
        });
    };

    reader.readAsText(file);
  }

  getSettings(lab: Lab): void {
    if (!lab.id) {
      console.error('Cannot get settings without required IDs');
      return;
    }

    const labId = lab.id;

    const remoteServers$: Observable<RemoteServer[]> =
      this.remoteServerService.getRemoteServerByServerType(
        getServerType(lab.labType!)
      );

    const remoteServerSelectFormData = new RemoteServerSelectData({
      remoteServer: remoteServers$,
    });

    let dialogCancelled = true;

    this.editDialogService
      .openDialog<any>(remoteServerSelectFormData, (response: any) => {
        if (!response?.remoteServer) {
          console.error('No remote server selected');
          return;
        }

        dialogCancelled = false;
        this.labService
          .getSettings(labId, response.remoteServer)
          .pipe(
            takeUntil(this.destroy$),
            catchError((error) => {
              console.error('Failed to get lab settings:', error);
              return of({
                code: 404,
                data: {},
                message: 'Failed to fetch settings',
              });
            })
          )
          .subscribe((res: ApiResponse<any>) => {
            if (!res.data || !res.data.yml) {
              console.error('No YAML data found in response!');
              return;
            }

            this.showOutputDialog('Lab Settings', res.data.yml, 'yaml', false);
          });
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (dialogCancelled && lab.id) {
        }
      });
  }

  isInTrackedLabs(labId?: string): boolean {
    if (!labId) return false;
    if (!this.labTrackers || this.labTrackers.length === 0) return false;
    return this.labTrackers.some((tracker) => tracker.labStarted?.id === labId);
  }

  onMouseEnter(): void {
    this.isHovered = true;
  }

  onMouseLeave(): void {
    this.isHovered = false;
  }

  private showOutputDialog(
    title: string,
    content: string | object,
    fileType: string,
    isReadOnly: boolean = true
  ): void {
    const dialogContent =
      typeof content === 'object' ? JSON.stringify(content, null, 2) : content;

    this.dialog.open(CommonDialogComponent, {
      data: {
        title: title,
        content: dialogContent,
        isCode: true,
        isReadOnly: isReadOnly,
        fileType: fileType,
      },
      width: '75rem',
      height: '50rem',
      disableClose: true,
    });
  }

  deleteLab(lab: Lab): void {
    // Show confirmation dialog before deleting
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '350px',
      data: {
        title: 'Delete Lab',
        message: `Are you sure you want to delete "${lab.name}"? This action cannot be undone.`,
        confirmButtonText: 'Delete',
        cancelButtonText: 'Cancel',
        confirmButtonColor: 'warn',
      },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.labService
          .deleteLabItem(lab.id!)
          .subscribe((res: ApiResponse<any>) => {
            if (res.data === true) {
              this.showNotification(
                `Lab "${lab.name}" successfully deleted`,
                'success'
              );

              this.labService.removeLab(lab);
            }
          });
      }
    });
  }

  private showNotification(
    message: string,
    type: 'success' | 'error' | 'warning'
  ): void {
    const panelClass = {
      success: ['notification-success'],
      error: ['notification-error'],
      warning: ['notification-warning'],
    }[type];

    this.snackBar.open(message, 'Close', {
      duration: 5000,
      horizontalPosition: 'end',
      verticalPosition: 'top',
      panelClass,
    });
  }
}
