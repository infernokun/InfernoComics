import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ComicBookService } from '../../services/comic-book.service';
import { ComicBook, ComicBookCondition } from '../../models/comic-book.model';
import { ComicVineIssue } from '../../models/comic-vine.model';
import { ComicBookRequest } from '../../models/comic-book-request.model';

export interface DialogData {
  seriesId: number;
  comicBook?: ComicBook;
  comicVineIssue?: ComicVineIssue;
  comicVineIssues?: ComicVineIssue[];
}

@Component({
  selector: 'app-comic-book-form',
  templateUrl: './comic-book-form.component.html',
  styleUrls: ['./comic-book-form.component.scss'],
  standalone: false
})
export class ComicBookFormComponent implements OnInit {
  comicBookForm: FormGroup;
  conditions = Object.values(ComicBookCondition);
  loading = false;
  isEditMode = false;

  constructor(
    private fb: FormBuilder,
    private comicBookService: ComicBookService,
    private snackBar: MatSnackBar,
    public dialogRef: MatDialogRef<ComicBookFormComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData
  ) {
    this.comicBookForm = this.createForm();
    this.isEditMode = !!data.comicBook;
  }

  ngOnInit(): void {
    if (this.data.comicBook) {
      // Edit mode - populate form with existing data
      this.populateFormForEdit();
    } else if (this.data.comicVineIssue) {
      // Add from Comic Vine - populate with Comic Vine data
      this.populateFormFromComicVine();
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
      isKeyIssue: [false]
    });
  }

  populateFormForEdit(): void {
    if (this.data.comicBook) {
      this.comicBookForm.patchValue({
        issueNumber: this.data.comicBook.issueNumber,
        title: this.data.comicBook.title,
        description: this.data.comicBook.description,
        coverDate: this.data.comicBook.coverDate,
        imageUrl: this.data.comicBook.imageUrl,
        condition: this.data.comicBook.condition,
        purchasePrice: this.data.comicBook.purchasePrice,
        currentValue: this.data.comicBook.currentValue,
        purchaseDate: this.data.comicBook.purchaseDate,
        notes: this.data.comicBook.notes,
        comicVineId: this.data.comicBook.comicVineId,
        isKeyIssue: this.data.comicBook.isKeyIssue
      });
    }
  }

  populateFormFromComicVine(): void {
    if (this.data.comicVineIssue) {
      const issue = this.data.comicVineIssue;
      this.comicBookForm.patchValue({
        issueNumber: issue.issueNumber,
        title: issue.name,
        description: issue.description,
        coverDate: issue.coverDate ? new Date(issue.coverDate) : null,
        imageUrl: issue.imageUrl,
        comicVineId: issue.id
      });
    }
  }

  onSubmit(): void {
    if (this.comicBookForm.valid) {
      this.loading = true;
      const formData = this.comicBookForm.value;
      
      const comicBookRequest: ComicBookRequest = {
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
        isKeyIssue: formData.isKeyIssue,
        generatedDescription: this.data.comicVineIssue?.generatedDescription || false
      };

      const operation = this.isEditMode && this.data.comicBook?.id
        ? this.comicBookService.updateComicBook(this.data.comicBook.id, comicBookRequest)
        : this.comicBookService.createComicBook(comicBookRequest);

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
}