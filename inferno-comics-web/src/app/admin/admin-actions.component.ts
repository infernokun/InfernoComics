import {
  Component,
  ViewEncapsulation,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ICellRendererParams } from 'ag-grid-community';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { MaterialModule } from '../material.module';


export interface AdminActionRendererParams extends ICellRendererParams {
  viewClick: (data: any) => void;
  editClick: (data: any) => void;
  deleteClick: (data: any) => void;
  playClick: (data: any) => void;
  addClick: (data: any) => void;
  showPlay: boolean;
  showAdd: boolean;
}

@Component({
  selector: 'app-admin-action',
  template: `
    <span class="row">
      <button mat-icon-button [matMenuTriggerFor]="menu" class="table-action" color="primary" matTooltip="Actions">
        <mat-icon class="sm-icon">more_vert</mat-icon>
      </button>
      <mat-menu #menu="matMenu">
        @if (params?.showPlay) {
          <button mat-menu-item (click)="play()">
            <mat-icon>play_arrow</mat-icon>
            <span>Play</span>
          </button>
        }
        @if (params?.showAdd) {
          <button mat-menu-item (click)="add()">
            <mat-icon>add</mat-icon>
            <span>Add</span>
          </button>
        }
        @if (!params || !params.data || (!!params.data && !!params.viewClick)) {
          <button mat-menu-item (click)="view()">
            <mat-icon>visibility</mat-icon>
            <span>View</span>
          </button>
        }
        @if (!params || !params.data || (!!params.data && !!params.editClick)) {
          <button mat-menu-item (click)="edit()">
            <mat-icon>edit</mat-icon>
            <span>Edit</span>
          </button>
        }
        @if (!params || !params.data || (!!params.data && !!params.deleteClick)) {
          <button mat-menu-item (click)="delete()">
            <mat-icon color="warn">delete</mat-icon>
            <span>Delete</span>
          </button>
        }
      </mat-menu>
    </span>
    `,
  styles: [`
    .row {
      display: flex;
      height: 100%;
      width: 100%;
      align-items: center;
      justify-content: center;
    }
    .table-action {
      margin: 0;
      padding: 0;
      min-width: 28px !important;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background-color: transparent;
      box-shadow: none;
      transition: background-color 0.2s ease;
    }
    .table-action:hover {
      background-color: rgba(0, 0, 0, 0.04);
    }
    .sm-icon {
      font-size: 18px !important;
      height: 16px;
      color: rgb(121, 86, 84);
    }
  `],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule]
})
export class AdminActionsComponent implements ICellRendererAngularComp {
  params?: AdminActionRendererParams;

  constructor() {}

  agInit(params: AdminActionRendererParams): void {
    this.params = params;
  }

  refresh(params: AdminActionRendererParams): boolean {
    this.params = params;
    return true;
  }

  view() {
    this.params?.viewClick(this.params?.data);
  }

  edit() {
    this.params?.editClick(this.params?.data);
  }

  delete() {
    this.params?.deleteClick(this.params?.data);
  }

  play() {
    this.params?.playClick(this.params?.data);
  }

  add() {
    this.params?.addClick(this.params?.data);
  }
}