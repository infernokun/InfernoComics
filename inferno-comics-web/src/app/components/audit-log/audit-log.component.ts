import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { LabTrackerService } from '../../services/lab/lab-tracker.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TABLE_ANIMATION } from '../../utils/animations';
import { LabTracker } from '../../models/lab/lab-tracker.model';

@Component({
  selector: 'amaterasu-audit-log',
  templateUrl: './audit-log.component.html',
  styleUrls: ['./audit-log.component.scss'],
  animations: [TABLE_ANIMATION],
  standalone: false
})
export class AuditLogComponent {
  @ViewChild('auditLogSort') auditLogSort = new MatSort();
  @ViewChild(MatPaginator) paginator!: MatPaginator | null;
  @ViewChild('input') filterInput!: ElementRef;

  @Input()
  labTrackers: LabTracker[] | undefined | null;

  @Input()
  actionsEnabled: boolean = false;

  displayedColumns: string[] = [
    'id',
    'createdBy',
    'createdAt',
    'updatedAt',
    'labStarted',
    'labStatus',
    'labOwner',
    'actions'
  ];

  highlightedId: string | null = null;

  // Filter values
  statusFilter: string = '';
  startDate: Date | null = null;
  endDate: Date | null = null;

  showPaginationInfo = false;

  auditLogDataSource: MatTableDataSource<LabTracker> =
    new MatTableDataSource<LabTracker>();

  constructor(private labTrackerService: LabTrackerService, private snackBar: MatSnackBar) { }

  ngOnInit() {
    this.labTrackerService.fetchLabTrackers();
    this.labTrackerService.labTrackers$.subscribe((labTrackers) => {
      this.auditLogDataSource = new MatTableDataSource<LabTracker>(labTrackers);

      // Set the custom filter predicate here to filter all fields
      this.auditLogDataSource.filterPredicate = (data: LabTracker, filter: string) => {
        const filterLower = filter.toLowerCase();

        // Loop through each property of the data object
        return Object.entries(data).some(([key, value]) =>
          value && value.toString().toLowerCase().includes(filterLower)
        );
      };

      this.auditLogDataSource.sort = this.auditLogSort;
      this.auditLogDataSource.paginator = this.paginator;
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.auditLogDataSource.sort = this.auditLogSort;
      this.auditLogDataSource.paginator = this.paginator;
      this.showPaginationInfo = true;
    });
  }

  applyFilter(event: Event | string): void {
    let filterValue = '';

    if (typeof event === 'string') {
      filterValue = event;
    } else {
      filterValue = (event.target as HTMLInputElement).value;
    }

    this.auditLogDataSource.filter = filterValue.trim().toLowerCase();

    if (this.auditLogDataSource.paginator) {
      this.auditLogDataSource.paginator.firstPage();
    }
  }

  refreshData(): void {
  }

  exportData(): void {
    this.snackBar.open('Exporting data...', 'Close', {
      duration: 3000,
      horizontalPosition: 'end',
      verticalPosition: 'top'
    });

    // Actual export logic would go here
    console.log('Exporting data:', this.auditLogDataSource.data);
  }

  viewDetails(id: string): void {
    console.log('Viewing details for ID:', id);

    // Navigate to details page or open a dialog/modal
    this.snackBar.open(`Viewing details for ${id}`, 'Close', {
      duration: 2000
    });
  }

  deleteRecord(id: string): void {
    if (confirm(`Are you sure you want to delete record ${id}?`)) {
      console.log('Deleting record with ID:', id);

      // Filter out the deleted record
      const updatedData = this.auditLogDataSource.data.filter(item => item.id !== id);
      this.auditLogDataSource.data = updatedData;

      this.snackBar.open(`Record ${id} deleted`, 'Undo', {
        duration: 3000,
        horizontalPosition: 'end',
        verticalPosition: 'top',
        panelClass: ['warn-snackbar']
      });
    }
  }

  pageChanged(event: PageEvent): void {
    // Any additional logic when page changes
    console.log('Page changed:', event);
  }

  resetFilters(): void {
    this.statusFilter = '';
    this.startDate = null;
    this.endDate = null;

    if (this.filterInput) {
      this.filterInput.nativeElement.value = '';
    }

    this.auditLogDataSource.filterPredicate = this.createFilterPredicate();
    this.auditLogDataSource.filter = '';
  }

  createFilterPredicate(): (data: LabTracker, filter: string) => boolean {
    return (data: LabTracker, filter: string): boolean => {
      const searchTerms = filter.trim().toLowerCase().split(' ');

      // Create a string of all values to be searched
      const dataStr = [
        data.id,
        data.createdBy,
        data.createdAt ? new Date(data.createdAt).toLocaleDateString() : '',
        data.updatedAt ? new Date(data.updatedAt).toLocaleDateString() : '',
        data.labStarted?.name || '',
        data.labStatus,
        data.labOwner?.name || ''
      ].join(' ').toLowerCase();

      // Check if all search terms are found
      return searchTerms.every(term => dataStr.includes(term));
    };
  }

  applyStatusFilter(): void {
    this.applyFilters();
  }

  applyFilters(): void {
    this.auditLogDataSource.filterPredicate = (data: LabTracker) => {
      let matches = true;

      // Apply status filter
      if (this.statusFilter && data.labStatus !== this.statusFilter) {
        matches = false;
      }

      // Apply date range filter
      if (this.startDate && this.endDate) {
        const createdAt = new Date(data.createdAt!);
        if (createdAt < this.startDate || createdAt > this.endDate) {
          matches = false;
        }
      }

      return matches;
    };

    // Trigger filter update
    this.auditLogDataSource.filter = ' ';
  }
}
