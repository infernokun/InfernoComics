import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CodeModel } from '@ngstack/code-editor';
import { QuestionBase } from '../../../../models/simple-form-data.model';
import { FormControl } from '@angular/forms';
import { MatSelectChange } from '@angular/material/select';
import { ApiResponse } from '../../../../models/api-response.model';
import { LabTracker } from '../../../../models/lab/lab-tracker.model';

@Component({
  selector: 'amaterasu-common-dialog',
  templateUrl: './common-dialog.component.html',
  styleUrls: ['./common-dialog.component.scss'],
  standalone: false
})
export class CommonDialogComponent {
  output: CodeModel;
  isCode: boolean = false;
  isReadOnly: boolean = false;
  fileType: string = '';
  options: { questions: QuestionBase[], current: string, async: Function, labTracker: LabTracker };

  formControl: FormControl = new FormControl('');

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { title: string, isCode: boolean, content: string, fileType: string, isReadOnly: boolean, options: { questions: QuestionBase[], current: string, async: Function, labTracker: LabTracker } },
    private dialogRef: MatDialogRef<CommonDialogComponent>
  ) {
    this.fileType = data.fileType;

    this.output = {
      language: data.fileType,
      uri: 'main.' + data.fileType,
      value: data.content,
    };
    this.isCode = data.isCode;
    this.isReadOnly = data.isReadOnly;
    this.options = data.options;

    if (this.options) {
      this.formControl.setValue(this.options.current);
    }
  }

  onCodeChange(newCode: string) {
    console.log('Updated Code:', newCode);
  }

  onVersionSelected(version: number) {
    console.log('Selected Version:', version);
  }

  close() {
    this.dialogRef.close();
  }

  handleMatSelect(event: MatSelectChange) {
    if (this.options.async) {
      this.options.async(this.options.labTracker.id, this.options.labTracker.remoteServer?.id, event.value).subscribe((res: ApiResponse<any>) => {
        this.output.value = res.data;
      })
    }
  }
}
