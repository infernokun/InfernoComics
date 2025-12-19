import { Component, Inject } from "@angular/core";
import { MatDialogRef, MAT_DIALOG_DATA, MatDialog } from "@angular/material/dialog";
import { IssueFormComponent } from "../../../issue-form/issue-form.component";
import { MaterialModule } from "../../../../material.module";
import { RecognitionService } from "../../../../services/recognition.service";

@Component({
  selector: 'comic-book-view-dialog',
  templateUrl: './issue-view-dialog.component.html',
  styleUrls: ['./issue-view-dialog.component.scss'],
  imports: [MaterialModule],
})
export class IssueViewDialog {
  Math = Math;
  showUploadedImage = false;

  constructor(
    public dialogRef: MatDialogRef<IssueViewDialog>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private dialog: MatDialog,
    private recognitionService: RecognitionService
  ) {
    console.log('IssueViewDialog initialized with data:', data);
  }

  editComic(): void {
    this.dialogRef.close();
    const editDialogRef = this.dialog.open(IssueFormComponent, {
      width: '600px',
      data: {
        issue: this.data.issue,
        seriesId: this.data.issue.seriesId,
      },
    });
  }

  formatCondition(condition: string): string {
    if (!condition) return 'Not specified';
    return condition
      .replace(/_/g, ' ')
      .toLowerCase()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  getConditionClass(condition: string): string {
    if (!condition) return '';
    return condition.toLowerCase().replace(/_/g, '-');
  }

  getProfitLoss(): number {
    const purchase = this.data.issue.purchasePrice || 0;
    const current = this.data.issue.currentValue || 0;
    return current - purchase;
  }

  toggleImageView(): void {
    this.showUploadedImage = !this.showUploadedImage;
  }

  getCurrentImageUrl(): string {
    if (this.showUploadedImage) {
      return this.recognitionService.getCurrentImageUrl(this.data);
    }
    return this.data.issue.imageUrl || 'assets/placeholder-comic.jpg';
  }

  hasUploadedImage(): boolean {
    return !!(this.data.issue.uploadedImageUrl && this.data.issue.uploadedImageUrl.trim());
  }

  getCurrentImageType(): string {
    return this.showUploadedImage ? 'Cover Image' : 'Uploaded Image';
  }
}