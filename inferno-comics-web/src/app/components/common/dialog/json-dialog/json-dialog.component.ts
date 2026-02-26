import { CommonModule } from "@angular/common";
import { Component, Inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MaterialModule } from "../../../../material.module";
import { ApiResponse } from "../../../../models/api-response.model";
import { SeriesService } from "../../../../services/series.service";
import { Clipboard, ClipboardModule } from "@angular/cdk/clipboard";
import { MessageService } from "../../../../services/message.service";

@Component({
  selector: 'app-json-dialog',
  templateUrl: './json-dialog.component.html',
  styleUrl: './json-dialog.component.scss',
  imports: [MaterialModule, CommonModule, ClipboardModule, FormsModule]
})
export class JsonDialogComponent {
  showRawJson = false;
  searchTerm = '';

  constructor(
    private clipboard: Clipboard,
    private messageService: MessageService,
    private seriesService: SeriesService,
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<JsonDialogComponent>,
  ) {}

  get totalPages(): number {
    return Math.ceil(this.data.totalCount / this.data.pageSize);
  }

  get filteredSeries(): { id: number; name: string }[] {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) return this.data.data;
    return this.data.data.filter((s: { id: number; name: string }) =>
      s.id.toString().includes(term) ||
      s.name.toLowerCase().includes(term) ||
      this.formatSeriesName(s.name).toLowerCase().includes(term)
    );
  }

  formatSeriesName(name: string): string {
    const withoutId = name.replace(/^\d+_/, '');
    return withoutId
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  formatJson(obj: any): string {
    return JSON.stringify(obj, null, 2);
  }

  toggleRawJson(): void {
    this.showRawJson = !this.showRawJson;
  }

  nextPage(): void {
    if (this.data.currentPage < this.totalPages - 1) {
      this.loadPage(this.data.currentPage + 1);
    }
  }

  previousPage(): void {
    if (this.data.currentPage > 0) {
      this.loadPage(this.data.currentPage - 1);
    }
  }

  goToFirstPage(): void {
    this.loadPage(0);
  }

  goToLastPage(): void {
    this.loadPage(this.totalPages - 1);
  }

  private loadPage(page: number): void {
    this.searchTerm = '';
    this.seriesService.getSeriesFolderStructure(page, this.data.pageSize).subscribe(
      (response: ApiResponse<{ id: number; name: string }[]>) => {
        this.data = response;
      }
    );
  }

  copyToClipboard(): void {
    this.clipboard.copy(this.formatJson(this.data));
    this.messageService.success('JSON response copied to clipboard!');
  }

  copyFolderId(folderName: string): void {
    this.clipboard.copy(folderName);
    this.messageService.success(`Copied "${folderName}"`);
  }

  close(): void {
    this.dialogRef.close();
  }
}
