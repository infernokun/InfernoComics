import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../../material.module';

export interface ConfirmationDialogData {
  title: string;
  message: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  confirmText?: string;
  cancelText?: string;
  confirmButtonColor?: 'primary' | 'accent' | 'warn';
  isDestructive?: boolean;
  details?: string[];
  showThirdOption?: boolean;
  thirdOptionText?: string;
}

@Component({
  selector: 'amaterasu-confirmation-dialog',
  templateUrl: './confirmation-dialog.component.html',
  styleUrl: './confirmation-dialog.component.scss',
  imports: [CommonModule, MaterialModule]
})
export class ConfirmationDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ConfirmationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmationDialogData
  ) {}

  getHeaderIcon(): string {
    if (this.data.isDestructive || this.data.confirmButtonColor === 'warn') {
      return 'warning';
    } else if (this.data.confirmButtonColor === 'accent') {
      return 'help';
    } else {
      return 'info';
    }
  }
}