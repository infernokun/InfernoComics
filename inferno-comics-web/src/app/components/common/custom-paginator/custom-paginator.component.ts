import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { MaterialModule } from '../../../material.module';

@Component({
  selector: 'app-custom-paginator',
  templateUrl: './custom-paginator.component.html',
  styleUrls: ['./custom-paginator.component.scss'],
  imports: [CommonModule, MaterialModule]
})
export class CustomPaginatorComponent implements OnInit {
  @Input() length = 0;
  @Input() pageSize = 10;
  @Input() pageSizeOptions: number[] = [5, 10, 25, 100];
  @Output() page = new EventEmitter<any>();

  currentPage = 1;
  totalPages = 0;
  displayedPages: number[] = [];

  ngOnInit(): void {
    this.updatePagination();
  }

  ngOnChanges(): void {
    this.updatePagination();
  }

  updatePagination(): void {
    this.totalPages = Math.ceil(this.length / this.pageSize);
    if (this.totalPages < 1) this.totalPages = 1;
    
    // Reset to first page if current exceeds total
    if (this.currentPage > this.totalPages) {
      this.currentPage = 1;
    }
    
    this.generateDisplayedPages();
  }

  generateDisplayedPages(): void {
    const maxVisible = 5;
    this.displayedPages = [];
    
    if (this.totalPages <= maxVisible) {
      for (let i = 1; i <= this.totalPages; i++) {
        this.displayedPages.push(i);
      }
    } else {
      const leftBound = Math.max(2, this.currentPage - 1);
      const rightBound = Math.min(this.totalPages - 1, this.currentPage + 1);
      
      this.displayedPages.push(1);
      
      if (leftBound > 2) {
        this.displayedPages.push(-1); // Ellipsis
      }
      
      for (let i = leftBound; i <= rightBound; i++) {
        this.displayedPages.push(i);
      }
      
      if (rightBound < this.totalPages - 1) {
        this.displayedPages.push(-1); // Ellipsis
      }
      
      this.displayedPages.push(this.totalPages);
    }
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) return;
    
    this.currentPage = page;
    this.page.emit({
      pageIndex: page - 1,
      pageSize: this.pageSize,
      length: this.length
    });
    this.generateDisplayedPages();
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.goToPage(this.currentPage + 1);
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.goToPage(this.currentPage - 1);
    }
  }

  firstPage(): void {
    this.goToPage(1);
  }

  lastPage(): void {
    this.goToPage(this.totalPages);
  }

  changePageSize(size: number): void {
    this.pageSize = size;
    this.currentPage = 1;
    this.updatePagination();
    this.page.emit({
      pageIndex: 0,
      pageSize: size,
      length: this.length
    });
  }

  isEllipsis(index: number): boolean {
    return index >= 0 && this.displayedPages[index] === -1;
  }

  getItemsCount(): string {
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.length);
    return `${start}-${end} of ${this.length}`;
  }
}