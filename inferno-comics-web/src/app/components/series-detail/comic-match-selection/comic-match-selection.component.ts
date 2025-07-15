import { CommonModule } from "@angular/common";
import { Component, Inject, OnInit, OnDestroy } from "@angular/core";
import { MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MaterialModule } from "../../../material.module";
import { Issue } from "../../../models/issue.model";

export interface ComicMatch {
  session_id: string;
  url: string;
  similarity: number;
  status: string;
  match_details: {
    orb: { good_matches: number; similarity: number; total_matches: number; };
    sift: { good_matches: number; similarity: number; total_matches: number; };
  };
  candidate_features: { orb_count: number; sift_count: number; };
  comic_name: string;
  issue_number: string;
  comic_vine_id: number | null;
  cover_error: string;
  issue: Issue | null;
  parent_comic_vine_id: number | null;
}

export interface ImageMatcherResponse {
  session_id: string;
  top_matches: ComicMatch[];
  total_matches: number;
  total_covers_processed: number;
  total_urls_processed: number;
}

export interface ComicMatchDialogData {
  matches: ComicMatch[];
  seriesId: number;
  sessionId?: string;
  originalImage?: File;
}

@Component({
  selector: 'app-comic-match-selection',
  templateUrl: './comic-match-selection.component.html',
  styleUrls: ['./comic-match-selection.component.scss'],
  imports: [CommonModule, MaterialModule],
})
export class ComicMatchSelectionComponent implements OnInit, OnDestroy {
  sessionId: string = '';
  sortedMatches: ComicMatch[] = [];
  private imagePreviewUrl: string | null = null;

  constructor(
    public dialogRef: MatDialogRef<ComicMatchSelectionComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ComicMatchDialogData
  ) {
    this.sessionId = data.sessionId || 'Unknown';
  }

  ngOnInit(): void {
    this.sortedMatches = [...this.data.matches].sort((a, b) => b.similarity - a.similarity);
    
    if (this.data.originalImage) {
      this.imagePreviewUrl = URL.createObjectURL(this.data.originalImage);
    }

    // Scroll to top
    setTimeout(() => this.scrollToTop(), 0);
  }

  ngOnDestroy(): void {
    if (this.imagePreviewUrl) {
      URL.revokeObjectURL(this.imagePreviewUrl);
    }
  }

  getImagePreview(): string | null {
    return this.imagePreviewUrl;
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getBestMatchPercentage(): number {
    return this.sortedMatches.length > 0 ? Math.round(this.sortedMatches[0].similarity * 100) : 0;
  }

  getFeaturePercent(feature: any): number {
    return feature.total_matches > 0 ? (feature.good_matches / feature.total_matches) * 100 : 0;
  }

  getConfidenceText(similarity: number): string {
    if (similarity >= 0.25) return 'High Confidence';
    if (similarity >= 0.15) return 'Medium Confidence';
    return 'Low Confidence';
  }

  selectMatch(match: ComicMatch): void {
    this.dialogRef.close({ action: 'select', match, seriesId: this.data.seriesId });
  }

  onCancel(): void {
    this.dialogRef.close({ action: 'cancel' });
  }

  onNoMatch(): void {
    this.dialogRef.close({ action: 'no_match', seriesId: this.data.seriesId });
  }

  onImageError(event: any): void {
    event.target.src = 'assets/images/no-cover-placeholder.png';
  }

  private scrollToTop(): void {
    const content = document.querySelector('.content');
    if (content) content.scrollTop = 0;
  }
}