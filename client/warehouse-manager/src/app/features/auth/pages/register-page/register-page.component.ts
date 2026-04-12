import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { getErrorMessage } from '../../../../core/error-handling/error-message.utils';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './register-page.component.html',
  styleUrl: './register-page.component.scss',
})
export class RegisterPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly form = this.fb.group({
    firstName: ['', [Validators.required, Validators.maxLength(50)]],
    lastName: ['', [Validators.required, Validators.maxLength(50)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(120)]],
    phone: ['', [Validators.maxLength(25)]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(120)]],
    confirmPassword: ['', [Validators.required]],
  });

  protected submitError = '';
  protected submitSuccess = '';
  protected submitting = false;

  protected register(): void {
    this.submitError = '';
    this.submitSuccess = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const rawValue = this.form.getRawValue();

    if (rawValue.password !== rawValue.confirmPassword) {
      this.submitError = 'Password and confirm password must match.';
      return;
    }

    this.submitting = true;

    this.authService.register({
      firstName: rawValue.firstName ?? '',
      lastName: rawValue.lastName ?? '',
      email: rawValue.email ?? '',
      phone: rawValue.phone ?? '',
      password: rawValue.password ?? '',
      confirmPassword: rawValue.confirmPassword ?? '',
    }).subscribe({
      next: () => {
        this.submitSuccess = 'Registration successful. You can now log in.';
        this.form.reset();
        this.router.navigate(['/login']);
      },
      error: (error) => {
        this.submitError = getErrorMessage(error);
        this.submitting = false;
      },
      complete: () => {
        this.submitting = false;
      },
    });
  }

  protected hasError(controlName: string, errorName: string): boolean {
    const control = this.form.get(controlName);
    return !!control && control.touched && control.hasError(errorName);
  }
}
