import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { LabService } from '../../../services/lab/lab.service';
import { BehaviorSubject, catchError, combineLatest, of, Subject, takeUntil } from 'rxjs';
import { UserService } from '../../../services/user.service';
import { LabTrackerService } from '../../../services/lab/lab-tracker.service';
import { ServerType } from '../../../enums/server-type.enum';
import { ApiResponse } from '../../../models/api-response.model';

import { load } from "js-yaml";
import { LabTracker } from '../../../models/lab/lab-tracker.model';

export interface Volume {
  source?: string;
  target?: string;
  readOnly?: boolean;
  isDirectory?: boolean;
}

export interface Service {
  image?: string;
  volumes?: Volume[];
}

export interface ComposeFile {
  services?: Record<string, Service>;
}

@Component({
  selector: 'amaterasu-lab-settings',
  templateUrl: './lab-settings.component.html',
  styleUrl: './lab-settings.component.scss',
  standalone: false
})
export class LabSettingsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  labId: string = '';
  labName: string = '';
  admin = false;

  ymlData: ComposeFile | undefined;

  labTrackerSubject: BehaviorSubject<LabTracker | undefined> = new BehaviorSubject<LabTracker | undefined>(undefined);
  labTracker: LabTracker | undefined;
  ServerType = ServerType;

  isLoading: boolean = true;

  constructor(private route: ActivatedRoute, private labService: LabService, private labTrackerService: LabTrackerService, private userService: UserService) { }

  ngOnInit(): void {
    // Use switchMap for better stream handling
    combineLatest([
      this.route.paramMap,
      this.route.queryParamMap
    ]).pipe(
      takeUntil(this.destroy$)
    ).subscribe(([paramMap, queryParamMap]) => {
      this.labName = paramMap.get('name') || '';
      this.labId = queryParamMap.get('id') || '';

      if (!this.labId) {
        console.error('No lab ID provided');
        return;
      }

      this.loadLabTracker();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadLabTracker(): void {
    this.labTrackerService.getLabTrackerById(this.labId).pipe(
      takeUntil(this.destroy$)
    ).subscribe((labTracker: LabTracker) => {
      console.log('labTracker', labTracker);
      this.labTracker = labTracker;
      this.labTrackerSubject.next(labTracker);

      if (!labTracker.services || labTracker.services.length < 1) {
        this.loadAdditionalSettings(labTracker);
      } else {
        this.isLoading = false;
      }
    });
  }

  private loadAdditionalSettings(labTracker: LabTracker): void {
    if (!labTracker.id || !labTracker.remoteServer?.id) {
      console.error('Missing required IDs to load settings');
      this.isLoading = false;
      return;
    }

    console.log("Loading additional config loader");
    this.labTrackerService.getSettings(labTracker.id, labTracker.remoteServer.id)
      .pipe(
        takeUntil(this.destroy$),
        catchError(error => {
          this.isLoading = false;
          console.error('Failed to get lab settings:', error);
          return of({ code: 404, data: {}, message: 'Failed to fetch settings' });
        })
      )
      .subscribe((res: ApiResponse<any>) => {
        if (res?.data?.yml) {
          try {
            // Parse YAML to JavaScript object
            const parsedYaml = load(res.data.yml) as ComposeFile;
            this.ymlData = parsedYaml;
            console.log('Parsed YAML data:', this.ymlData);

            // Check if services exist in the parsed data
            if (this.ymlData.services) {
              console.log('First service:', Object.values(this.ymlData.services)[0]);
            } else {
              console.warn('No services found in YAML data');
            }
          } catch (e) {
            console.error('Error parsing YAML:', e);
          }
        }

        this.isLoading = false;
      });
  }
}
