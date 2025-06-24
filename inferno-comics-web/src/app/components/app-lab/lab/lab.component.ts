import { Component, OnDestroy, OnInit, signal, WritableSignal } from '@angular/core';
import { LabService } from '../../../services/lab/lab.service';
import {
  Observable,
  switchMap,
  of,
  filter,
  takeUntil,
  catchError,
  Subject,
  tap,
  timer,
} from 'rxjs';
import { User } from '../../../models/user.model';
import { ApiResponse } from '../../../models/api-response.model';
import { LabTrackerService } from '../../../services/lab/lab-tracker.service';
import { Team } from '../../../models/team.model';
import { LabStatus } from '../../../enums/lab-status.enum';
import { EditDialogService } from '../../../services/edit-dialog.service';
import { LabType } from '../../../enums/lab-type.enum';
import { ProxmoxService } from '../../../services/lab/proxmox.service';
import { RemoteServerService } from '../../../services/lab/remote-server.service';
import { AuthService } from '../../../services/auth.service';
import { DateUtils } from '../../../utils/date-utils';
import { LabTracker } from '../../../models/lab/lab-tracker.model';
import { RemoteServer } from '../../../models/lab/remote-server.model';
import { Lab, LabDTO, LabFormData } from '../../../models/lab/lab.model';

@Component({
  selector: 'amaterasu-lab',
  templateUrl: './lab.component.html',
  styleUrl: './lab.component.scss',
  animations: [],
  standalone: false,
})
export class LabComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  labs: Lab[] = [];
  team: Team | undefined;
  trackedLabs: LabTracker[] = [];
  loggedInUser: User | undefined;

  labsCount: number = 0;

  isHovered: boolean = false;
  busy: boolean = false;
  dockerComposeData: any;

  LabType = LabType;

  labs$: Observable<Lab[] | undefined> | undefined;
  loggedInUser$: Observable<User | undefined>
  labTrackersByTeam$: Observable<LabTracker[]> = of([]);

  isLoading: WritableSignal<boolean> = signal(false);

  constructor(
    private labService: LabService,
    private labTrackerService: LabTrackerService,
    private editDialogService: EditDialogService,
    private proxmoxService: ProxmoxService,
    private remoteServerService: RemoteServerService,
    private authService: AuthService
  ) {
    this.loggedInUser$ = this.authService.user$;
  }

  ngOnInit(): void {
    this.initializeData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeData(): void {
    this.isLoading.set(true);


    // Set up subscription to labs
    this.labService.labs$.pipe(
      takeUntil(this.destroy$)
    ).subscribe((labs: Lab[] | undefined) => {
      if (!labs) return;

      this.labs = labs;
      this.labsCount = this.labs.length;
      console.log('Labs loaded:', labs);
    });

    // Handle user and trackers separately
    this.loggedInUser$.pipe(
      takeUntil(this.destroy$),
      filter(user => !!user), // Only proceed if user exists
      tap((user) => {
        // Fetch labs only when we have an authenticated user
        this.labService.fetchLabs();

        this.loggedInUser = user;
      }),
      switchMap(user => this.labTrackerService.getLabTrackersByTeam(user?.team?.id!)),
      catchError(error => {
        console.error('Error fetching lab trackers:', error);
        return of([]);
      })
    ).subscribe((labTrackers: LabTracker[]) => {
      this.trackedLabs = labTrackers.filter(
        tracker => tracker.labStatus !== LabStatus.DELETED
      );
      this.labTrackerService.setLabTrackersByTeam(this.trackedLabs);

      this.isLoading.set(false);
    });

    timer(1000).pipe(
      takeUntil(this.destroy$),
      takeUntil(this.loggedInUser$.pipe(filter(user => !!user)))
    ).subscribe(() => {
      // If after 2 seconds we still don't have a user, stop showing loading indicator
      if (this.isLoading) {
        this.isLoading.set(false);
      }
    });
  }

  addLab(): void {
    const labFormData: LabFormData = new LabFormData();
    const vmTemplates = this.proxmoxService.getVMTemplates.bind(
      this.proxmoxService
    );

    const remoteServers$: Observable<RemoteServer[]> =
      this.remoteServerService.getAllServers();

    const labFormDataWithVMs = new LabFormData(
      (k: any, v: any) => { },
      {
        remoteServer: remoteServers$,
        //'vms': vmTemplates$
      },
      {
        vms: vmTemplates,
      }
    );

    this.editDialogService
      .openDialog<Lab>(labFormDataWithVMs, (labDTO: LabDTO) => {
        if (!labDTO) return;
        this.busy = true;

        labDTO = new LabDTO(labDTO);
        labDTO.createdBy = this.loggedInUser?.username;

        this.labService
          .createNewLab(
            labDTO,
            this.remoteServerService.getSelectedRemoteServer().id!
          )
          .subscribe((labResp: ApiResponse<Lab>) => {
            this.busy = false;

            if (!labResp.data) return;

            this.labService.addNewLab(new Lab(labResp.data));
          });
      })
      .subscribe((res: any) => { });
  }

  formatDate(date: Date): string {
    return DateUtils.formatDateWithTime(date);
  }

  onMouseEnter(): void {
    this.isHovered = true;
  }

  onMouseLeave(): void {
    this.isHovered = false;
  }

  clear(): void {
    const teamId = this.loggedInUser?.team?.id;
    if (!teamId) {
      console.error('Team ID is missing');
      return;
    }

    this.labService.clear(teamId)
      .pipe(
        takeUntil(this.destroy$),
        catchError(error => {
          console.error('Failed to clear labs:', error);
          return of(null);
        })
      )
      .subscribe({
        next: () => window.location.reload(),
        error: (err) => console.error('Failed to clear labs:', err)
      });
  }

  formatLabName(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-');
  }
}
