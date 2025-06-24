import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  Inject,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChildren,
} from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { forkJoin, Observable, of, Subscription } from 'rxjs';
import { map, take } from 'rxjs/operators';

import { DialogQuestionComponent } from '../dialog-question/dialog-question.component';
import { LabType } from '../../../../enums/lab-type.enum';
import { ServerType } from '../../../../enums/server-type.enum';
import { SimpleFormData } from '../../../../models/simple-form-data.model';
import { LabService } from '../../../../services/lab/lab.service';
import { MessageService } from '../../../../services/message.service';
import { RemoteServerService } from '../../../../services/lab/remote-server.service';
import { REQUIRED } from '../../../../utils/amaterasu.const';
import { RemoteServer } from '../../../../models/lab/remote-server.model';

@Component({
  selector: 'amaterasu-add-dialog-form',
  templateUrl: './add-dialog-form.component.html',
  styleUrls: ['./add-dialog-form.component.scss'],
  standalone: false,
})
export class AddDialogFormComponent
  implements OnInit, AfterViewInit, OnDestroy {
  @ViewChildren(DialogQuestionComponent)
  questionComponents!: QueryList<DialogQuestionComponent>;

  dynamicForm!: FormGroup;
  private subscriptions = new Subscription();

  isLoading = false;

  // Constants
  private readonly REQUIRED_VALIDATION_TYPES = ['remoteServer', 'lab'];

  // Server type to lab type mapping
  private readonly SERVER_TYPE_LAB_CONSTRAINTS: Record<ServerType, LabType[]> =
    {
      [ServerType.DOCKER_HOST]: [
        LabType.DOCKER_COMPOSE,
        LabType.DOCKER_CONTAINER,
        LabType.KUBERNETES,
      ],
      [ServerType.PROXMOX]: [LabType.VIRTUAL_MACHINE],
      [ServerType.UNKNOWN]: [],
    };

  private asyncDataMap: Map<string, any[]> = new Map();

  constructor(
    public dialogRef: MatDialogRef<AddDialogFormComponent>,
    @Inject(MAT_DIALOG_DATA) public data: SimpleFormData,
    private fb: FormBuilder,
    private messageService: MessageService,
    private remoteServerService: RemoteServerService,
    private labService: LabService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.isLoading = true;
    this.initializeFormData();
    this.dynamicForm = this.fb.group({});
  }

  ngAfterViewInit(): void {
    this.setupFormControls();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private initializeFormData(): void {
    this.data.questions.forEach((question) => {
      // Set callback for value updates
      question.cb = (key: string, value: string) => this.updateMap(key, value);

      // Pre-fill data if available
      if (this.data.preFilledData?.has(question.key)) {
        question.value = this.data.preFilledData.get(question.key);
      }
    });

    this.isLoading = false;
  }

  private setupFormControls(): void {
    if (!this.questionComponents) {
      this.isLoading = false;
      return;
    }

    const formSetupObservables = this.questionComponents.map((component) => {
      // Add form control
      this.dynamicForm.addControl(
        component.question.key,
        component.formControl
      );

      // Process async data if present
      if (component.question.asyncData) {
        return this.processAsyncData(component);
      }

      return of(component);
    });

    const subscription = forkJoin(formSetupObservables).subscribe({
      next: () => {
        if (this.data.typeName === 'lab') {
          this.checkForRemoteServer();
        }
      },
      error: (err) => console.error('Error setting up form:', err),
    });

    this.subscriptions.add(subscription);
  }

  private processAsyncData(component: DialogQuestionComponent): Observable<DialogQuestionComponent> {
    return component.question.asyncData!.pipe(
      take(1),
      map((data: any[]) => {
        if (!data || data.length === 0) {
          return component;
        }

        switch (component.question.key) {
          case 'remoteServer':
            this.handleRemoteServerData(component, data);
            break;
          case 'team':
            this.handleTeamData(component, data);
            break;
          default:
            break;
        }

        return component;
      })
    );
  }

  private handleRemoteServerData(
    component: DialogQuestionComponent,
    data: any[]
  ): void {
    data.sort((a, b) => a.name.localeCompare(b.name));

    this.asyncDataMap.set('remoteServer', data);

    component.question.options = data
      .filter((r) => r.name && r.id)
      .map((r) => ({ key: r.name, value: r.id, disabled: false }));

    if (component.question.options.length > 0) {
      component.formControl.setValue(component.question.options[0].value);
    }

    this.labLock(data[0]);
  }

  dropdownSelectionChanged(event: { key: string; value: string }) {
    console.log('Dropdown selection changed:', event);

    if (event.key === 'remoteServer') {
      this.asyncDataMap.get(event.key)?.forEach((item) => {
        if (item.id === event.value) {
          this.labLock(item);
        }
      });
    }
  }

  private handleTeamData(
    component: DialogQuestionComponent,
    data: any[]
  ): void {
    data.sort((a, b) => a.name.localeCompare(b.name));

    this.asyncDataMap.set('team', data);

    component.question.options = data
      .filter((t) => t.name && t.id)
      .map((t) => ({ key: t.name, value: t.id, disabled: false }));

    if (component.question.options.length > 0) {
      component.formControl.setValue(component.question.options[0].value);
    }
  }

  labLock(remoteServer: RemoteServer): void {
    const labTypeQuestion = this.questionComponents?.find(
      (q) => q.question.key === 'labType'
    );

    if (!labTypeQuestion) {
      return;
    }

    // Reset all options first
    labTypeQuestion.question.options.forEach((option) => {
      option.disabled = false;
    });

    // Apply constraints based on server type
    const allowedLabTypes =
      this.SERVER_TYPE_LAB_CONSTRAINTS[remoteServer.serverType!];

    if (allowedLabTypes) {
      labTypeQuestion.question.options.forEach((option) => {
        option.disabled = !allowedLabTypes.includes(option.value as LabType);
      });

      // Get current selection
      const currentValue = labTypeQuestion.formControl?.value;

      // Check if current selection is now disabled
      const isCurrentSelectionDisabled = labTypeQuestion.question.options.find(
        (option) => option.value === currentValue
      )?.disabled;

      // If current selection is disabled or undefined, select the first non-disabled option
      if (isCurrentSelectionDisabled || currentValue === undefined) {
        const firstEnabledOption = labTypeQuestion.question.options.find(
          (option) => !option.disabled
        );

        if (firstEnabledOption) {
          // Update form control with new value
          labTypeQuestion.formControl?.setValue(firstEnabledOption.value);

          // If you have a callback for value changes, trigger it
          if (labTypeQuestion.question.cb) {
            labTypeQuestion.question.cb('labType', firstEnabledOption.value);
          }

          this.radioSelectionChanged({ key: 'labType', value: firstEnabledOption.value });
        } else {
          console.warn('No enabled options available for labType');
        }
      }
    }
  }

  checkForRemoteServer(): void {
    const remoteValue = this.dynamicForm?.get('remoteServer')?.value;
    if (remoteValue === '') {
      setTimeout(() => {
        this.questionComponents?.forEach((component) => {
          component.isDisabled = component.question.key !== 'remoteServer';
        });
      });
    }
  }

  onSubmit(): void {
    if (!this.dynamicForm) {
      return;
    }

    const requiresSpecialValidation = this.REQUIRED_VALIDATION_TYPES.includes(
      this.data.typeName
    );

    if (requiresSpecialValidation) {
      this.handleSpecialValidation();
      return;
    }

    if (this.dynamicForm.valid) {
      this.dialogRef.close(this.data);
    } else {
      this.showValidationErrors();
    }
  }

  private handleSpecialValidation(): void {
    if (this.data.typeName == 'lab') {
      switch (this.dynamicForm.value['labType']) {
        case LabType.DOCKER_COMPOSE:
          if (this.dynamicForm.valid) {
            if (this.checkQuestionsValidation()) {
              this.dialogRef.close(this.data);
            } else {
              this.messageService.snackbar('Form must be validated via the validate button.');
            }
          } else {
            this.showValidationErrors();
          }
          break;
        case LabType.VIRTUAL_MACHINE:
          if (this.dynamicForm.valid) {
            if (this.dynamicForm.value['vms'] < 1) {
              this.messageService.snackbar('Please select at least one VM template.');
            } else {
              this.dialogRef.close(this.data);
            }
          } else {
            this.showValidationErrors();
          }
          break;
        default:
          this.messageService.snackbar('Unknown lab type.');
          return;
      }
    } else if (this.data.typeName == 'remoteServer') {
      if (this.dynamicForm.valid) {
        if (this.checkQuestionsValidation()) {
          this.dialogRef.close(this.data);
        } else {
          this.messageService.snackbar('Form must be validated via the validate button.');
        }
      } else {
        this.showValidationErrors();
      }
    }
  }

  private showValidationErrors(): void {
    const invalidControls = this.getInvalidControlLabels();

    if (invalidControls.length > 0) {
      const message = `The following values are not valid: ${invalidControls.join(
        ', '
      )}`;
      this.messageService.snackbar(message);
    }
  }

  private getInvalidControlLabels(): string[] {
    const invalidControls: string[] = [];

    Object.keys(this.dynamicForm!.controls).forEach((key) => {
      const control = this.dynamicForm!.get(key);
      const component: DialogQuestionComponent | undefined = this.questionComponents.find((q) => q.question.key === key);

      if (control && !control.valid && component && !component.isHidden && REQUIRED.includes(key)) {
        invalidControls.push(this.getQuestionLabelByKey(key));
      }
    });

    return invalidControls;
  }

  checkQuestionsValidation(): boolean {
    return this.questionComponents!.toArray().every(
      (component: DialogQuestionComponent) => component.isValidated
    );
  }

  getFormData(): Map<string, string> {
    return this.data.result;
  }

  getQuestionLabelByKey(key: string): string {
    const question = this.data.questions.find((q) => q.key === key);
    return question ? question.label : key;
  }

  onCancel(): void {
    this.dialogRef.close(undefined);
  }

  updateMap(key: string, value: string): void {
    this.data.result.set(key, value);
  }

  private originalValidatorsMap = new Map<string, any>();

  radioSelectionChanged(event: { key: string, value: string }): void {
    const selectedEnum = event.value;

    this.questionComponents?.forEach((component: DialogQuestionComponent) => {
      component.isValidated = false;
      if (!component.question.neededEnum) {
        return;
      }

      const isNeeded = component.question.neededEnum.value.includes(selectedEnum);
      component.isHidden = !isNeeded;

      if (component.formControl) {
        const control = this.dynamicForm.controls[component.question.key];
        const key = component.question.key;

        if (isNeeded) {
          // Restore original validators if they exist
          if (this.originalValidatorsMap.has(key)) {
            control.setValidators(this.originalValidatorsMap.get(key));
            control.updateValueAndValidity();
          }
          this.loadComponentAsyncData(component);
        } else {
          // Store original validators before clearing
          if (control.validator && !this.originalValidatorsMap.has(key)) {
            this.originalValidatorsMap.set(key, control.validator);
          }

          // Clear validators temporarily
          control.setValidators(null);
          control.updateValueAndValidity();
        }
      }
    });
  }

  private loadComponentAsyncData(component: DialogQuestionComponent): void {
    /*if (component.question.asyncData) {
      console.log('Async data:', component.question);

      component.question.asyncData.subscribe((data) => {
        console.log('Async data:', data);
        component.question.options2 = data.map((o: any) => ({
          key: o.vmid,
          value: o.name,
        }));
      });
    }*/

    const remoteServerQuestion: DialogQuestionComponent | undefined = this.questionComponents?.find(
      (q) => q.question.key === 'remoteServer'
    );
    const remoteServerValue = remoteServerQuestion?.formControl?.value;

    if (component.question.function && remoteServerValue) {
      component.question.function(remoteServerValue).subscribe((data: any) => {
        component.question.options2 = data.map((o: any) => ({
          key: o.name,
          value: o.vmid,
        }));
      });
    }
  }

  buttonQuestionFunction(qKey: string): void {
    if (qKey === 'dockerFile') {
      const validateComponent = this.questionComponents?.find(
        (component) => component.question.key === 'validate'
      );

      this.dynamicForm.get(qKey)!.setValue(null);
      this.dynamicForm.get(qKey)!.markAsUntouched();

      if (validateComponent) {
        if (this.questionComponents && validateComponent.question.dataBoolean) {
          validateComponent.question.dataBoolean = false;
          this.questionComponents.forEach((component) => {
            component.isValidated = false;
          });
        }
      }
    }

    if (qKey === 'validate') {
      if (this.data.typeName === 'remoteServer') {
        this.validateRemoteServer();
      } else if (this.data.typeName === 'lab') {
        this.validateLab();
      }
    }
  }

  private validateRemoteServer(): void {
    if (!this.checkFormValidity()) {
      return;
    }

    const formData: RemoteServer = Object.fromEntries(
      this.data.result as Map<string, string>
    );

    this.remoteServerService.validateServer(formData).subscribe({
      next: (response) => this.handleValidationResponse(response),
      error: (err) => {
        console.error('Validation error:', err);
        this.messageService.snackbar('Validation error occurred.');
      },
    });
  }

  private validateLab(): void {
    switch (this.dynamicForm.value['labType']) {
      case LabType.DOCKER_COMPOSE:
        if (!this.data.result.has('dockerFile')) {
          this.messageService.snackbar(
            'Please upload a Docker Compose file first.'
          );
          return;
        }

        if (!this.checkFormValidity()) {
          return;
        }

        this.labService
          .validateDockerComposeFile(this.data.result.get('dockerFile')!)
          .subscribe({
            next: (response) => this.handleValidationResponse(response),
          });
        break;
      case LabType.VIRTUAL_MACHINE:
        /*if (!this.data.result.has('vms')) {
          this.messageService.snackbar('Please select a VM template first.');
          return;
        }
        if (!this.checkFormValidity()) {
          return;
        }
        this.labService
          .validateVMTemplate(this.data.result.get('vms')!)
          .subscribe({
            next: (response) => this.handleValidationResponse(response),
          });*/
        break;
      case LabType.DOCKER_CONTAINER:
        if (!this.data.result.has('containers')) {
          this.messageService.snackbar(
            'Please select a Docker container first.'
          );
          return;
        }
        if (!this.checkFormValidity()) {
          return;
        }
        break;
      default:
        this.messageService.snackbar(
          'Validation not supported for this lab type.'
        );
        return;
    }
  }

  private checkFormValidity(): boolean {
    if (this.dynamicForm!.valid) {
      return true;
    }

    this.showValidationErrors();
    return false;
  }

  private handleValidationResponse(response: any): void {
    const isValid = !!response.data;

    const validateComponent = this.questionComponents?.find(
      (component) => component.question.key === 'validate'
    );

    if (validateComponent) {
      validateComponent.question.dataBoolean = isValid;
    }

    this.messageService.snackbar(
      isValid ? 'Validation successful!' : 'Validation failed.'
    );

    if (isValid && this.questionComponents) {
      this.questionComponents.forEach((component) => {
        component.isValidated = true;
      });
    }
  }

  formatCamelCase(text: string): string {
    if (!text) return '';

    const spaced = text.replace(/([A-Z])/g, ' $1');

    return spaced.charAt(0).toUpperCase() + spaced.slice(1).trim();
  }
}
