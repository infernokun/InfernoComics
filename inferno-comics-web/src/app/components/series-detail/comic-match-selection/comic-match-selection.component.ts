import { CommonModule } from "@angular/common";
import { Component, Inject, OnInit } from "@angular/core";
import { MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MaterialModule } from "../../../material.module";
import { IssueService } from "../../../services/issue.service";
import { Issue } from "../../../models/issue.model";

export interface ComicMatch {
  url: string;
  similarity: number;
  status: string;
  match_details: {
    orb: {
      good_matches: number;
      similarity: number;
      total_matches: number;
    };
    sift: {
      good_matches: number;
      similarity: number;
      total_matches: number;
    };
  };
  candidate_features: {
    orb_count: number;
    sift_count: number;
  };
  comic_name: string;
  issue_number: string;
  comic_vine_id: number | null;
  cover_error: string;
  issue: Issue | null;
  parent_comic_vine_id: number | null;
}

export interface ImageMatcherResponse {
  top_matches: ComicMatch[];
  total_matches: number;
  total_covers_processed: number;
  total_urls_processed: number;
}

export interface ComicMatchDialogData {
  matches: ComicMatch[];
  seriesId: number;
}

@Component({
  selector: 'app-comic-match-selection',
  templateUrl: './comic-match-selection.component.html',
  styleUrls: ['./comic-match-selection.component.scss'],
  imports: [CommonModule, MaterialModule],
})
export class ComicMatchSelectionComponent implements OnInit {
  sortedMatches: ComicMatch[] = [];

  constructor(
    public dialogRef: MatDialogRef<ComicMatchSelectionComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ComicMatchDialogData
  ) {}

  ngOnInit(): void {
    // Sort matches by similarity score (highest first)
    this.sortedMatches = [...this.data.matches].sort((a, b) => b.similarity - a.similarity);
  }

  selectMatch(match: ComicMatch): void {
    this.dialogRef.close({ 
      action: 'select', 
      match: match,
      seriesId: this.data.seriesId 
    });
  }

  onCancel(): void {
    this.dialogRef.close({ action: 'cancel' });
  }

  onNoMatch(): void {
    this.dialogRef.close({ 
      action: 'no_match', 
      seriesId: this.data.seriesId 
    });
  }

  onImageError(event: any): void {
    event.target.src = 'assets/images/no-cover-placeholder.png'; // Fallback image
  }
}