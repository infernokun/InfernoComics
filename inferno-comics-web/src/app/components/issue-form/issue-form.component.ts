import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { IssueService } from '../../services/issue.service';
import { Issue, IssueCondition } from '../../models/issue.model';
import { ComicVineIssue } from '../../models/comic-vine.model';
import { IssueRequest } from '../../models/issue-request.model';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../material.module';

export interface IssueFormData {
  seriesId: number;
  issue?: Issue;
  comicVineIssue?: ComicVineIssue;
  comicVineIssues?: ComicVineIssue[];
  prefillData?: {
    title?: string;
    issueNumber?: string;
    coverImageUrl?: string;
  };
}

@Component({
  selector: 'app-issue-form',
  templateUrl: './issue-form.component.html',
  styleUrls: ['./issue-form.component.scss'],
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
})
export class IssueFormComponent implements OnInit {
  issueForm: FormGroup;
  conditions = Object.values(IssueCondition);
  loading = false;
  isEditMode = false;
  isFromImageMatch = false;  // New property to track if this is from image matching

  constructor(
    private fb: FormBuilder,
    private issueService: IssueService,
    private snackBar: MatSnackBar,
    public dialogRef: MatDialogRef<IssueFormComponent>,
    @Inject(MAT_DIALOG_DATA) public data: IssueFormData
  ) {
    this.issueForm = this.createForm();
    this.isEditMode = !!data.issue;
    this.isFromImageMatch = !!data.prefillData;
  }

  ngOnInit(): void {
    console.log('IssueFormComponent initialized with data:', this.data);
    if (this.data.issue) {
      this.populateFormForEdit();
    } else if (this.data.comicVineIssue) {
      this.populateFormFromComicVine();
    }

    if (this.data.prefillData) {
      this.prefillForm();
    }
  }

  private prefillForm(): void {
    const prefillData = this.data.prefillData;
    
    if (prefillData) {
      this.issueForm.patchValue({
        title: prefillData.title || '',
        issueNumber: prefillData.issueNumber || '',
        imageUrl: prefillData.coverImageUrl || '',
      });
    }
  }

  createForm(): FormGroup {
    return this.fb.group({
      issueNumber: ['', [Validators.required]],
      title: [''],
      description: [''],
      coverDate: [''],
      imageUrl: [''],
      condition: [''],
      purchasePrice: [''],
      currentValue: [''],
      purchaseDate: [''],
      notes: [''],
      comicVineId: [''],
      keyIssue: [false],
      variant: [false]
    });
  }

  populateFormForEdit(): void {
    if (this.data.issue) {
      this.issueForm.patchValue({
        issueNumber: this.data.issue.issueNumber,
        title: this.data.issue.title,
        description: this.data.issue.description,
        coverDate: this.data.issue.coverDate,
        imageUrl: this.data.issue.imageUrl,
        condition: this.data.issue.condition,
        purchasePrice: this.data.issue.purchasePrice,
        currentValue: this.data.issue.currentValue,
        purchaseDate: this.data.issue.purchaseDate,
        notes: this.data.issue.notes,
        comicVineId: this.data.issue.comicVineId,
        keyIssue: this.data.issue.keyIssue,
        variant: this.data.issue.variant || false
      });
    }
  }

  populateFormFromComicVine(): void {
    if (this.data.comicVineIssue) {
      const issue = this.data.comicVineIssue;
      this.issueForm.patchValue({
        issueNumber: issue.issueNumber,
        title: issue.name,
        description: issue.description,
        coverDate: issue.coverDate ? new Date(issue.coverDate) : null,
        imageUrl: issue.imageUrl,
        comicVineId: issue.id,
        keyIssue: issue.keyIssue || false,
        variant: issue.variant || false
      });
    }
  }

  onSubmit(): void {
    if (this.issueForm.valid) {
      this.loading = true;
      const formData = this.issueForm.value;
      
      const issueRequest: IssueRequest = {
        seriesId: this.data.seriesId,
        issueNumber: formData.issueNumber,
        title: formData.title,
        description: formData.description,
        coverDate: formData.coverDate,
        imageUrl: formData.imageUrl,
        condition: formData.condition,
        purchasePrice: formData.purchasePrice,
        currentValue: formData.currentValue,
        purchaseDate: formData.purchaseDate,
        notes: formData.notes,
        comicVineId: formData.comicVineId,
        keyIssue: formData.keyIssue,
        variant: formData.variant || false,
        generatedDescription: this.data.comicVineIssue?.generatedDescription || false
      };

      const operation = this.isEditMode && this.data.issue?.id
        ? this.issueService.updateIssue(this.data.issue.id, issueRequest)
        : this.issueService.createIssue(issueRequest);

      operation.subscribe({
        next: (result) => {
          const message = this.isEditMode ? 'Comic book updated successfully' : 'Comic book added successfully';
          this.snackBar.open(message, 'Close', { duration: 3000 });
          this.dialogRef.close(result);
        },
        error: (error) => {
          console.error('Error saving comic book:', error);
          this.snackBar.open('Error saving comic book', 'Close', { duration: 3000 });
          this.loading = false;
        }
      });
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }

  getConditionDisplayName(condition: string): string {
    return condition.replace(/_/g, ' ').toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // Helper method to check if a field was auto-filled from image matching
  isFieldAutoFilled(fieldName: string): boolean {
    if (!this.isFromImageMatch || !this.data.prefillData) return false;
    
    switch (fieldName) {
      case 'title': return !!this.data.prefillData.title;
      case 'issueNumber': return !!this.data.prefillData.issueNumber;
      case 'imageUrl': return !!this.data.prefillData.coverImageUrl;
      default: return false;
    }
  }
}