// register.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoginService } from '../../../services/login.service';
import { finalize, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { ApiResponse } from '../../../models/api-response.model';

interface PasswordStrength {
  text: string;
  color: string;
  score: number;
}

@Component({
  selector: 'amaterasu-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
  standalone: false
})
export class RegisterComponent implements OnInit, OnDestroy {
  readonly MIN_USERNAME_LENGTH = 3;
  readonly MIN_PASSWORD_LENGTH = 8;
  
  registerForm!: FormGroup;
  busy = false;
  hidePassword = true;
  hideConfirmPassword = true;
  formSubmitted = false;
  errorMessage = '';
  
  private readonly destroy$ = new Subject<void>();
  
  constructor(
    private readonly loginService: LoginService,
    private readonly dialogRef: MatDialogRef<RegisterComponent>,
    private readonly snackBar: MatSnackBar,
    private readonly fb: FormBuilder
  ) {}

  ngOnInit(): void {
    this.initializeForm();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeForm(): void {
    this.registerForm = this.fb.group({
      username: ['', [
        Validators.required, 
        Validators.minLength(this.MIN_USERNAME_LENGTH),
        Validators.pattern(/^[a-zA-Z0-9_]+$/) // alphanumeric and underscore only
      ]],
      email: ['', [Validators.email]],
      password: ['', [
        Validators.required, 
        Validators.minLength(this.MIN_PASSWORD_LENGTH),
        this.passwordStrengthValidator.bind(this)
      ]],
      confirmPassword: ['', [Validators.required]]
    }, { 
      validators: this.passwordMatchValidator.bind(this)
    });

    // Disable email field (as per original requirement)
    this.emailControl?.disable();
  }

  // Enhanced password strength validator
  private passwordStrengthValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (!value) {
      return null;
    }

    const requirements = {
      hasUpperCase: /[A-Z]/.test(value),
      hasLowerCase: /[a-z]/.test(value),
      hasNumeric: /[0-9]/.test(value),
      hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(value),
      hasMinLength: value.length >= this.MIN_PASSWORD_LENGTH
    };

    const missingRequirements = Object.entries(requirements)
      .filter(([_, meets]) => !meets)
      .map(([req]) => req);

    return missingRequirements.length > 0 ? { 
      passwordStrength: { 
        missing: missingRequirements,
        requirements 
      } 
    } : null;
  }

  // Enhanced password match validator
  private passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password');
    const confirmPassword = control.get('confirmPassword');

    if (!password || !confirmPassword || !password.value || !confirmPassword.value) {
      return null;
    }

    return password.value === confirmPassword.value ? null : { passwordMismatch: true };
  }

  // Submit form with improved error handling
  public registerClick(): void {
    this.formSubmitted = true;
    this.errorMessage = '';
    
    this.markAllFieldsAsTouched();
    
    if (this.registerForm.invalid) {
      this.showValidationErrors();
      return;
    }
    
    this.performRegistration();
  }

  private markAllFieldsAsTouched(): void {
    Object.keys(this.registerForm.controls).forEach(key => {
      this.registerForm.get(key)?.markAsTouched();
    });
  }

  private showValidationErrors(): void {
    const firstErrorField = this.getFirstErrorField();
    if (firstErrorField) {
      this.showSnackBar(`Please fix the error in ${firstErrorField}`, 'error-snackbar');
    }
  }

  private getFirstErrorField(): string | null {
    const fieldNames = { username: 'Username', email: 'Email', password: 'Password', confirmPassword: 'Confirm Password' };
    
    for (const [key, displayName] of Object.entries(fieldNames)) {
      const control = this.registerForm.get(key);
      if (control?.invalid && control?.touched) {
        return displayName;
      }
    }
    return null;
  }

  private performRegistration(): void {
    this.busy = true;
    const { username, password, email } = this.registerForm.value;
    
    this.loginService.register(username, password)
      .pipe(
        finalize(() => this.busy = false),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (res) => this.handleRegistrationSuccess(res),
        error: (error) => this.handleRegistrationError(error)
      });
  }

  private handleRegistrationSuccess(res: ApiResponse<any>): void {
    console.log('Registration successful:', res);
    this.dialogRef.close(true);
    this.showSnackBar('Registration successful! You can now log in.', 'success-snackbar');
  }

  private handleRegistrationError(error: any): void {
    console.error('Registration error:', error);
    
    const errorMessage = this.extractErrorMessage(error);
    this.errorMessage = errorMessage;
    this.showSnackBar(`Registration failed: ${errorMessage}`, 'error-snackbar');
  }

  private extractErrorMessage(error: any): string {
    // Handle different error response structures
    console.log(error.error.message);
    if (error?.error?.message) {
      return this.cleanErrorMessage(error.error.message);
    }
    
    if (error?.message) {
      return this.cleanErrorMessage(error.message);
    }
    
    if (error?.statusText && error.statusText !== 'OK') {
      return error.statusText;
    }
    
    return 'An unexpected error occurred. Please try again.';
  }

  private cleanErrorMessage(message: string): string {
    // Remove common prefixes from API error messages
    return message
      .replace(/^(AuthFailedException|Error|Exception):\s*/i, '')
      .trim();
  }

  private showSnackBar(message: string, panelClass: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 5000,
      panelClass,
      horizontalPosition: 'center',
      verticalPosition: 'top'
    });
  }

  // Getter methods for template access
  get usernameControl(): AbstractControl | null { return this.registerForm.get('username'); }
  get emailControl(): AbstractControl | null { return this.registerForm.get('email'); }
  get passwordControl(): AbstractControl | null { return this.registerForm.get('password'); }
  get confirmPasswordControl(): AbstractControl | null { return this.registerForm.get('confirmPassword'); }
  
  // Enhanced password strength calculation
  getPasswordStrength(): PasswordStrength {
    const password = this.passwordControl?.value;
    
    if (!password) {
      return { text: 'Enter password', color: '#6b7280', score: 0 };
    }
    
    const checks = {
      length: password.length >= this.MIN_PASSWORD_LENGTH,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      numbers: /[0-9]/.test(password),
      symbols: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    };
    
    const score = Object.values(checks).filter(Boolean).length;
    
    if (password.length < 6) {
      return { text: 'Too short', color: '#ef4444', score: 0 };
    }
    
    const strengthLevels = [
      { text: 'Very weak', color: '#ef4444' },
      { text: 'Weak', color: '#f59e0b' },
      { text: 'Fair', color: '#f59e0b' },
      { text: 'Good', color: '#10b981' },
      { text: 'Strong', color: '#3b82f6' },
      { text: 'Very strong', color: '#8b5cf6' }
    ];
    
    return { ...strengthLevels[Math.min(score, 5)], score };
  }

  // Helper methods for template
  passwordsMatch(): boolean {
    const password = this.passwordControl?.value;
    const confirmPassword = this.confirmPasswordControl?.value;
    return !!password && !!confirmPassword && password === confirmPassword;
  }

  getPasswordRequirements(): Array<{text: string, met: boolean}> {
    const password = this.passwordControl?.value || '';
    
    return [
      { text: `At least ${this.MIN_PASSWORD_LENGTH} characters`, met: password.length >= this.MIN_PASSWORD_LENGTH },
      { text: 'One uppercase letter', met: /[A-Z]/.test(password) },
      { text: 'One lowercase letter', met: /[a-z]/.test(password) },
      { text: 'One number', met: /[0-9]/.test(password) },
      { text: 'One special character', met: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) }
    ];
  }

  // Field validation helpers for template
  hasFieldError(fieldName: string): boolean {
    const field = this.registerForm.get(fieldName);
    return !!(field?.invalid && (field?.touched || this.formSubmitted));
  }

  getFieldErrorMessage(fieldName: string): string {
    const field = this.registerForm.get(fieldName);
    if (!field?.errors) return '';

    const errors = field.errors;
    
    switch (fieldName) {
      case 'username':
        if (errors['required']) return 'Username is required';
        if (errors['minlength']) return `Username must be at least ${this.MIN_USERNAME_LENGTH} characters`;
        if (errors['pattern']) return 'Username can only contain letters, numbers, and underscores';
        break;
        
      case 'email':
        if (errors['email']) return 'Please enter a valid email address';
        break;
        
      case 'password':
        if (errors['required']) return 'Password is required';
        if (errors['minlength']) return `Password must be at least ${this.MIN_PASSWORD_LENGTH} characters`;
        if (errors['passwordStrength']) return 'Password does not meet strength requirements';
        break;
        
      case 'confirmPassword':
        if (errors['required']) return 'Please confirm your password';
        break;
    }
    
    if (this.registerForm.errors?.['passwordMismatch'] && fieldName === 'confirmPassword') {
      return 'Passwords do not match';
    }
    
    return 'Invalid input';
  }

  // Toggle password visibility
  togglePasswordVisibility(): void {
    this.hidePassword = !this.hidePassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.hideConfirmPassword = !this.hideConfirmPassword;
  }
}