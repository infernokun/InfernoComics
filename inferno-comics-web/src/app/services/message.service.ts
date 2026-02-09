import { Injectable, TemplateRef } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import {
  MatSnackBar,
  MatSnackBarConfig,
  MatSnackBarRef,
  TextOnlySnackBar,
} from '@angular/material/snack-bar';
import { Observable } from 'rxjs';
import { CommonDialogComponent } from '../components/common/dialog/common-dialog/common-dialog.component';

export type SnackbarType = 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface MessageOptions {
  duration?: number;
  action?: string;
  verticalPosition?: 'top' | 'bottom';
  horizontalPosition?: 'start' | 'center' | 'end' | 'left' | 'right';
}

const DEFAULT_DURATION: Record<SnackbarType, number> = {
  success: 3000,
  error: 5000,
  warning: 4000,
  info: 3000,
  loading: 0,
};

@Injectable({
  providedIn: 'root',
})
export class MessageService {
  private snackBarIsDisplayed = false;

  constructor(private snackBar: MatSnackBar, private matDialog: MatDialog) {}

  success(message: string, options?: MessageOptions): MatSnackBarRef<TextOnlySnackBar> {
    return this.show(message, 'success', options);
  }

  error(message: string, options?: MessageOptions): MatSnackBarRef<TextOnlySnackBar> {
    return this.show(message, 'error', options);
  }

  warning(message: string, options?: MessageOptions): MatSnackBarRef<TextOnlySnackBar> {
    return this.show(message, 'warning', options);
  }

  info(message: string, options?: MessageOptions): MatSnackBarRef<TextOnlySnackBar> {
    return this.show(message, 'info', options);
  }

  loading(message: string, options?: MessageOptions): MatSnackBarRef<TextOnlySnackBar> {
    return this.show(message, 'loading', { duration: 0, ...options });
  }

  dismiss(): void {
    this.snackBar.dismiss();
  }

  private show(
    message: string,
    type: SnackbarType,
    options?: MessageOptions
  ): MatSnackBarRef<TextOnlySnackBar> {
    const config: MatSnackBarConfig = {
      duration: options?.duration ?? DEFAULT_DURATION[type],
      panelClass: [`snackbar-${type}`],
      verticalPosition: options?.verticalPosition ?? 'bottom',
      horizontalPosition: options?.horizontalPosition ?? 'end',
    };

    const ref = this.snackBar.open(
      message,
      options?.action ?? (type === 'loading' ? '' : 'Close'),
      config
    );

    this.snackBarIsDisplayed = true;
    ref.afterDismissed().subscribe(() => {
      this.snackBarIsDisplayed = false;
    });

    return ref;
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
    return this.matDialog
      .open(CommonDialogComponent, {
        data: {
          title: title || 'Are you sure?',
          message: message || 'Proceeding may adversely affect your experience',
          showCancel: true,
        },
      })
      .afterClosed();
  }

  dialogAreYouSureClean(title?: string): Observable<any> {
    return this.matDialog
      .open(CommonDialogComponent, {
        data: {
          title: title || 'Are you sure?',
          message: '',
          showCancel: true,
        },
      })
      .afterClosed();
  }

  dialogWithContent(
    title: string,
    template: TemplateRef<any>,
    context: any
  ): Observable<any> {
    return this.matDialog
      .open(CommonDialogComponent, {
        data: {
          title,
          template,
          context,
          showCancel: true,
        },
      })
      .afterClosed();
  }

  get getSnackBarIsDisplayed() {
    return this.snackBarIsDisplayed;
  }
}
