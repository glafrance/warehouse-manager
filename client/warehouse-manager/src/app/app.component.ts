import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from './core/services/auth.service';
import { GlobalErrorService } from './core/error-handling/global-error.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  protected readonly authService = inject(AuthService);
  protected readonly globalErrorService = inject(GlobalErrorService);

  ngOnInit(): void {
    this.authService.initializeAuthState().subscribe({
      next: () => undefined,
      error: () => undefined,
    });
  }

  protected logout(): void {
    this.authService.logout().subscribe({
      next: () => undefined,
      error: () => undefined,
    });
  }

  protected dismissGlobalError(): void {
    this.globalErrorService.clear();
  }
}
