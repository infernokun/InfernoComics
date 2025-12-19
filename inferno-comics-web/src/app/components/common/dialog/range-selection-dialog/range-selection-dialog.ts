
import { Component, Inject } from "@angular/core";
import { MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MaterialModule } from "../../../../material.module";
import { FormsModule } from "@angular/forms";

@Component({
  selector: 'range-selection-dialog',
  template: `
    <h2 mat-dialog-title>Select Issue Range</h2>
    <mat-dialog-content>
      <div class="range-form">
        <mat-form-field appearance="outline">
          <mat-label>Start Issue</mat-label>
          <input matInput type="number" [(ngModel)]="startIssue" min="1" />
        </mat-form-field>
    
        <mat-form-field appearance="outline">
          <mat-label>End Issue</mat-label>
          <input matInput type="number" [(ngModel)]="endIssue" min="1" />
        </mat-form-field>
      </div>
    
      @if (startIssue && endIssue) {
        <p class="range-preview">
          Will select {{ getIssueCount() }} issues ({{ startIssue }} -
          {{ endIssue }})
        </p>
      }
    </mat-dialog-content>
    <mat-dialog-actions>
      <button mat-button (click)="cancel()">Cancel</button>
      <button
        mat-raised-button
        color="primary"
        (click)="confirm()"
        [disabled]="!isValid()"
        >
        Select Range
      </button>
    </mat-dialog-actions>
    `,
  styles: [
    `
      .range-form {
        display: flex;
        gap: 16px;
        margin-bottom: 16px;
      }
      .range-preview {
        color: var(--text-secondary);
        font-style: italic;
      }
    `,
  ],
  imports: [MaterialModule, FormsModule]
})
export class RangeSelectionDialog {
  startIssue: number = 1;
  endIssue: number = 1;

  constructor(
    public dialogRef: MatDialogRef<RangeSelectionDialog>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.endIssue = data.maxIssue || 1;
  }

  cancel(): void {
    this.dialogRef.close();
  }

  confirm(): void {
    if (this.isValid()) {
      this.dialogRef.close({
        start: this.startIssue,
        end: this.endIssue,
      });
    }
  }

  isValid(): boolean {
    return (
      this.startIssue > 0 &&
      this.endIssue > 0 &&
      this.startIssue <= this.endIssue
    );
  }

  getIssueCount(): number {
    if (this.isValid()) {
      return this.endIssue - this.startIssue + 1;
    }
    return 0;
  }
}