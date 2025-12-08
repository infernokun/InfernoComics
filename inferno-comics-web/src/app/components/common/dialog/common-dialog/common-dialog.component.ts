import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { QuestionBase } from '../../../../models/simple-form-data.model';
import { FormControl } from '@angular/forms';

@Component({
  selector: 'app-common-dialog',
  templateUrl: './common-dialog.component.html',
  styleUrls: ['./common-dialog.component.scss'],
  standalone: false
})
export class CommonDialogComponent {
  isCode: boolean = false;
  isReadOnly: boolean = false;
  fileType: string = '';
  options: { questions: QuestionBase[], current: string, async: Function };

  formControl: FormControl = new FormControl('');

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { title: string, isCode: boolean, content: string, fileType: string, isReadOnly: boolean, options: { questions: QuestionBase[], current: string, async: Function } },
    private dialogRef: MatDialogRef<CommonDialogComponent>
  ) {
    this.fileType = data.fileType;

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
}
