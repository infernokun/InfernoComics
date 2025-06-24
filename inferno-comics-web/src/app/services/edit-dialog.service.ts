import { Injectable } from '@angular/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { SimpleFormData } from '../models/simple-form-data.model';
import { map, Observable } from 'rxjs';
import { StoredObject } from '../models/stored-object.model';
import { LoginComponent } from '../components/common/login/login.component';
import { RegisterComponent } from '../components/common/register/register.component';
import { ComponentType } from '@angular/cdk/overlay';
import { AddDialogFormComponent } from '../components/common/dialog/add-dialog-form/add-dialog-form.component';
import { CTFEntity } from '../models/ctf/ctf-entity.model';
import { ViewCTFComponent } from '../components/app-ctf/view/view-ctf.component';

@Injectable({
  providedIn: 'root'
})
export class EditDialogService {
  constructor(private dialog: MatDialog) { }

  openForm(formData: SimpleFormData | any | undefined, component?: ComponentType<any>, customConfig?: MatDialogConfig): Observable<any> {
    const config = customConfig || new MatDialogConfig();
    config.disableClose = config.disableClose ?? true;
    config.autoFocus = config.autoFocus ?? true;
    config.data = formData ?? config.data;
    config.minWidth = config.minWidth ?? "50vw";
    return this.dialog
      .open(component ? component : AddDialogFormComponent, config)
      .afterClosed();
  }

  openDialog<T extends StoredObject>(
    formData: SimpleFormData,
    cb: Function
  ): Observable<any> {
    return this.openForm(formData).pipe(
      map((res) => {
        if (res instanceof SimpleFormData) {
          const temp = new Object() as T;
          res.fillObject(temp);
          cb(temp);
        }
      })
    );
  }

  openLoginDialog(): Observable<any> {
    const config = new MatDialogConfig();
    config.disableClose = false;
    return this.openForm(undefined, LoginComponent, config);
  }

  openRegisterDialog(): Observable<any> {
    const config = new MatDialogConfig();
    config.disableClose = false;
    return this.openForm(undefined, RegisterComponent, config);
  }

  openViewDialog(formData: CTFEntity): Observable<any> {
    const config: MatDialogConfig = {
      disableClose: false,
      autoFocus: true,
      data: formData,
      minWidth: "50vw"
    }

    return this.openForm(formData, ViewCTFComponent, config);
  }
}
