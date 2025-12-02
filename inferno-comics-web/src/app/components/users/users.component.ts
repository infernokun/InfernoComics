import { Component, OnInit } from '@angular/core';
import { User, UserFormData } from '../../models/user.model';
import { UserService } from '../../services/user.service';
import { EditDialogService } from '../../services/edit-dialog.service';
import { Observable } from 'rxjs';
import { MessageService } from '../../services/message.service';
import { AuthService } from '../../services/auth.service';
import {
  AllCommunityModule,
  ColDef,
  FirstDataRenderedEvent,
  GridApi,
  GridOptions,
  GridReadyEvent,
  ModuleRegistry,
} from 'ag-grid-community';
import { AdminActionsComponent } from '../../admin/admin-actions.component';

ModuleRegistry.registerModules([AllCommunityModule]);

@Component({
  selector: 'amaterasu-users',
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss',
  standalone: false,
})
export class UsersComponent implements OnInit {
  users: User[] = [];
  busy: boolean = false;

  gridOptions?: GridOptions<User>;

  defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    floatingFilter: true,
    resizable: true,
    suppressSizeToFit: false,
    filterParams: {
      buttons: ['clear', 'reset'],
      debounceMs: 200
    },
  };

  gridApi?: GridApi;

  loggedInUser$: Observable<User | undefined> | undefined;

  constructor(
    private userService: UserService,
    private dialog: EditDialogService,
    private messageService: MessageService,
    private authService: AuthService
  ) {
    // Initialize gridOptions without rowData initially
    this.gridOptions = {
      animateRows: false,
      cellFlashDuration: 0,
      pagination: false,
      suppressColumnVirtualisation: false,
      suppressRowVirtualisation: false,
      suppressDragLeaveHidesColumns: true,
      suppressMovableColumns: false,
      columnDefs: this.getColumnDefs(),
      onGridReady: (params: GridReadyEvent) => this.onGridReady(params),
      onFirstDataRendered: (params: FirstDataRenderedEvent) =>
        this.onFirstDataRendered(params),
    };
  }

  ngOnInit(): void {
    this.loggedInUser$ = this.authService.user$;

    this.userService.getAllUsers().subscribe({
      next: (users: User[]) => {
        console.log('Users received:', users);
        console.log('Users count:', users?.length || 0);

        // Check if users is actually an array
        if (!Array.isArray(users)) {
          console.error('Users is not an array:', users);
          this.users = [];
          return;
        }

        this.users = users;

        // Update grid data if grid is ready
        if (this.gridApi) {
          console.log('Updating grid with users:', this.users);
          this.gridApi.setGridOption('rowData', this.users);

          // Force refresh
          this.gridApi.refreshCells();

          // Size columns after data update
          setTimeout(() => {
            this.gridApi?.sizeColumnsToFit();
          }, 100);
        }
      },
      error: (error) => {
        console.error('Error fetching users:', error);
        this.users = [];
      }
    });
  }

  onGridReady(params: GridReadyEvent) {
    console.log('Grid ready');
    this.gridApi = params.api;

    // Set initial data if we already have users
    if (this.users && this.users.length > 0) {
      console.log('Setting initial grid data:', this.users);
      this.gridApi.setGridOption('rowData', this.users);
    }
  }

  onFirstDataRendered(params: FirstDataRenderedEvent) {
    console.log('First data rendered');
    params.api.autoSizeAllColumns();
  }

  getColumnDefs(): ColDef[] {
    let columns: ColDef[] = [
      {
        headerName: 'Actions',
        width: 120,
        minWidth: 120,
        maxWidth: 150,
        resizable: false,
        sortable: false,
        filter: false,
        floatingFilter: false,
        suppressMovable: true,
        lockPosition: 'left',
        cellRenderer: AdminActionsComponent,
        cellRendererParams: {
          viewClick: (data: any) => console.log('viewClick', data),
          editClick: (data: any) => console.log('editClick', data),
          deleteClick: (data: any) => console.log('deleteClick', data),
        },
        pinned: 'left'
      },
      {
        headerName: 'ID',
        field: 'id',
        sort: 'asc',
        width: 80,
        minWidth: 60,
        maxWidth: 300,
        resizable: true,
        suppressMovable: false,
        filter: 'agNumberColumnFilter',
        floatingFilter: true
      },
      {
        headerName: 'Username',
        field: 'username',
        width: 200,
        minWidth: 150,
        maxWidth: 300,
        resizable: true,
        suppressMovable: false,
        filter: 'agTextColumnFilter',
        floatingFilter: true
      },
      {
        headerName: 'Team',
        field: 'team.name',
        valueGetter: (params) => {
          // Add null safety
          return params.data?.team?.name ?? 'Not Assigned';
        },
        width: 150,
        minWidth: 120,
        maxWidth: 300,
        resizable: true,
        suppressMovable: false,
        filter: 'agTextColumnFilter',
        floatingFilter: true
      },
      {
        headerName: 'Role',
        field: 'role',
        width: 120,
        minWidth: 100,
        maxWidth: 300,
        resizable: true,
        suppressMovable: false,
        filter: 'agTextColumnFilter',
        floatingFilter: true
      },
    ];

    return columns;
  }

  editUsers() {
    const userFormData = new UserFormData(this.users, (k: any, v: any) => { });

    this.dialog
      .openDialog<any>(userFormData, (data: { user: string; team: string }) => {
        this.busy = true;
        if (!data) return;

        this.userService
          .setUserTeam(data.user, data.team)
          .subscribe((updatedUser: User) => {
            this.users = this.users.map((u) =>
              u.id === updatedUser.id ? updatedUser : u
            );
            this.authService.setUser(updatedUser);

            // Update grid after user update
            this.gridApi?.setGridOption('rowData', this.users);
          });
      })
      .subscribe((res: any) => { });
  }

  importUserJson($event: Event) {
    // TODO: Implement import functionality
  }

  exportUsers() {
    // TODO: Implement export functionality
  }

  addUser() {
    // TODO: Implement add user functionality
  }

  getActiveUsersCount(): number {
    return -1;
    //return this.users.filter(user => user.active !== false).length;
  }
}
