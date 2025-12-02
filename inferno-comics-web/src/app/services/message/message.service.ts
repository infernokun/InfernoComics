import { Injectable, TemplateRef } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarConfig, MatSnackBarRef, SimpleSnackBar } from '@angular/material/snack-bar';
import { Observable } from 'rxjs';
import { CommonDialogComponent } from '../../components/common/dialog/common-dialog/common-dialog.component';

@Injectable({
  providedIn: 'root',
})
export class MessageService {
  private snackBarIsDisplayed: boolean = false;

  constructor(
    private snackBar: MatSnackBar,
    private matDialog: MatDialog
  ) { }

  add(
    message: string,
    duration = 2000
  ): MatSnackBarRef<SimpleSnackBar> {
    return this.snackBar.open(message, undefined, {
      duration,
      verticalPosition: 'top',
    });
  }

  snackbar(message: string) {
    this.snackBarIsDisplayed = true;

    const config = new MatSnackBarConfig();
    config.panelClass = ['bg-accent', 'border-radius'];
    config.duration = 5000;
    config.verticalPosition = 'bottom';
    config.horizontalPosition = 'end';
    this.snackBar.open(message, undefined, config).afterDismissed().subscribe(() => { this.snackBarIsDisplayed = false; });
  }

  dialog(title?: string, message?: string): void {
    this.matDialog.open(CommonDialogComponent, {
      data: {
        title: title || 'There was a problem.',
        message: message || 'Sorry',
        showCancel: false,
      },
    });
  }

  dialogAreYouSure(title?: string, message?: string): Observable<any> {
    return (
      this.matDialog
        .open(CommonDialogComponent, {
          data: {
            title: title || 'Are you sure?',
            message:
              message || 'Proceeding may adversely affect your experience',
            showCancel: true,
          },
        })
        /* return the result of the dialog through an observable */
        .afterClosed()
    );
  }

  dialogAreYouSureClean(title?: string): Observable<any> {
    return (
      this.matDialog
        .open(CommonDialogComponent, {
          data: {
            title: title || 'Are you sure?',
            message: '',
            showCancel: true,
          },
        })
        /* return the result of the dialog through an observable */
        .afterClosed()
    );
  }

  dialogWithContent(
    title: string,
    template: TemplateRef<any>,
    context: any
  ): Observable<any> {
    return (
      this.matDialog
        .open(CommonDialogComponent, {
          data: {
            title,
            template,
            context,
            showCancel: true,
          },
        })
        /* return the result of the dialog through an observable */
        .afterClosed()
    );
  }

  get getSnackBarIsDisplayed() { return this.snackBarIsDisplayed; }
}
