import { Component, NgZone, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { AppInitService } from '../../services/app-init.service';
import { ApplicationInfo } from '../../models/application-info.model';
import { ApiResponse } from '../../models/api-response.model';
import { Router } from '@angular/router';
import { Observable, of } from 'rxjs';

@Component({
  selector: 'amaterasu-initialization',
  templateUrl: './initialization.component.html',
  styleUrls: ['./initialization.component.scss'],
  standalone: false
})
export class InitializationComponent implements OnInit {
  formGroup: FormGroup;
  isInitialized$: Observable<boolean> | undefined = of(false);

  constructor(private appInitService: AppInitService, private router: Router, private ngZone: NgZone) {
    this.formGroup = new FormGroup({
      name: new FormControl(''),
      description: new FormControl(''),
      settings: new FormGroup({
        enableDarkMode: new FormControl(true),
        notifications: new FormControl(true),
        language: new FormControl('en')
      })
    });
  }

  ngOnInit(): void {
    this.isInitialized$ = this.appInitService.isInitialized();
    this.isInitialized$.subscribe((initialized: boolean) => {
      console.log('Initialization status helpppp:', initialized);
      if (initialized) {
        this.ngZone.run(() => {
          this.router.navigate(['/home']);
        });
      }
    });

    /*this.formGroup.valueChanges.subscribe((value: any) => {
      console.log(value);
    });*/
  }

  handleAction() {
    let applicationInfo: ApplicationInfo = this.formGroup.value;
    applicationInfo.settings = JSON.stringify(this.formGroup.value.settings);

    this.appInitService.createApplicationInfo(applicationInfo).subscribe(
      (response: ApiResponse<any>) => {
        if (response && response.data) {
          this.appInitService.applicationInfo$.next(new ApplicationInfo(response.data));
          this.appInitService.setInitialized(true);
          this.router.navigate(['/home']);
        }
      },
      (error) => {
        console.log('Error creating application info: ', error);
        this.router.navigate(['/home']);
      }
    );
  }
}
