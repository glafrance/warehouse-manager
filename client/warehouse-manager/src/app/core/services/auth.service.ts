import {
  HttpBackend,
  HttpClient,
  HttpContext,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, finalize, of, shareReplay, tap, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  AuthResponse,
  AuthUser,
  LoginRequest,
  RegisterRequest,
  Role,
} from '../models/auth.models';
import { SKIP_AUTH, SKIP_GLOBAL_ERROR } from '../http/http-context.tokens';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly apiBaseUrl = environment.apiBaseUrl;
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly bareHttp = new HttpClient(inject(HttpBackend));

  private readonly currentUserSubject = new BehaviorSubject<AuthUser | null>(this.readStoredUser());

  readonly currentUser$ = this.currentUserSubject.asObservable();

  private refreshRequest$?: Observable<AuthResponse>;

  register(payload: RegisterRequest): Observable<void> {
    const { confirmPassword: _confirmPassword, ...requestBody } = payload;

    return this.http.post<void>(
      `${this.apiBaseUrl}/auth/register`,
      requestBody,
      {
        context: new HttpContext()
          .set(SKIP_AUTH, true)
          .set(SKIP_GLOBAL_ERROR, true),
      },
    );
  }

  login(payload: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(
      `${this.apiBaseUrl}/auth/login`,
      payload,
      {
        context: new HttpContext()
          .set(SKIP_AUTH, true)
          .set(SKIP_GLOBAL_ERROR, true),
      },
    ).pipe(
      tap((response) => this.handleAuthSuccess(response)),
    );
  }

  logout(): Observable<void> {
    const refreshToken = this.getRefreshToken();

    const request$ = refreshToken
      ? this.bareHttp.post<void>(
          `${this.apiBaseUrl}/auth/logout`,
          { refreshToken },
          {
            context: new HttpContext()
              .set(SKIP_AUTH, true)
              .set(SKIP_GLOBAL_ERROR, true),
          },
        )
      : of(void 0);

    return request$.pipe(
      finalize(() => {
        this.clearSession();
        this.router.navigate(['/login']);
      }),
    );
  }

  refreshAccessToken(): Observable<AuthResponse> {
    const refreshToken = this.getRefreshToken();

    if (!refreshToken) {
      return throwError(() => new Error('No refresh token is available.'));
    }

    if (!this.refreshRequest$) {
      this.refreshRequest$ = this.bareHttp.post<AuthResponse>(
        `${this.apiBaseUrl}/auth/refresh`,
        { refreshToken },
        {
          context: new HttpContext()
            .set(SKIP_AUTH, true)
            .set(SKIP_GLOBAL_ERROR, true),
        },
      ).pipe(
        tap((response) => this.handleAuthSuccess(response)),
        shareReplay(1),
        finalize(() => {
          this.refreshRequest$ = undefined;
        }),
      );
    }

    return this.refreshRequest$;
  }

  getAccessToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  getRefreshToken(): string | null {
    return localStorage.getItem('refreshToken');
  }

  hasRefreshToken(): boolean {
    return !!this.getRefreshToken();
  }

  isAuthenticated(): boolean {
    return !!this.currentUserSubject.value && !!this.getAccessToken();
  }

  getCurrentUser(): AuthUser | null {
    return this.currentUserSubject.value;
  }

  hasAnyRole(requiredRoles: Role[]): boolean {
    const currentUser = this.currentUserSubject.value;
    if (!currentUser?.roles?.length) {
      return false;
    }

    return requiredRoles.some((role) => currentUser.roles.includes(role));
  }

  clearSession(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('currentUser');
    this.currentUserSubject.next(null);
  }

  private handleAuthSuccess(response: AuthResponse): void {
    localStorage.setItem('accessToken', response.accessToken);
    localStorage.setItem('refreshToken', response.refreshToken);
    localStorage.setItem('currentUser', JSON.stringify(response.user));
    this.currentUserSubject.next(response.user);
  }

  private readStoredUser(): AuthUser | null {
    const stored = localStorage.getItem('currentUser');
    if (!stored) {
      return null;
    }

    try {
      return JSON.parse(stored) as AuthUser;
    } catch {
      return null;
    }
  }
}
