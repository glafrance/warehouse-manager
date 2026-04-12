import {
  HttpContext,
  HttpErrorResponse,
  HttpRequest,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { HAS_REFRESH_ATTEMPTED, SKIP_AUTH, SKIP_GLOBAL_ERROR } from '../http/http-context.tokens';

function shouldSkipAuth(request: HttpRequest<unknown>): boolean {
  if (request.context.get(SKIP_AUTH)) {
    return true;
  }

  return (
    request.url.includes('/auth/login') ||
    request.url.includes('/auth/register') ||
    request.url.includes('/auth/refresh')
  );
}

function addAccessToken(
  request: HttpRequest<unknown>,
  accessToken: string | null,
): HttpRequest<unknown> {
  if (!accessToken) {
    return request;
  }

  return request.clone({
    setHeaders: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const accessToken = authService.getAccessToken();
  const requestToSend = shouldSkipAuth(req) ? req : addAccessToken(req, accessToken);

  return next(requestToSend).pipe(
    catchError((error: unknown) => {
      const canTryRefresh =
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !shouldSkipAuth(req) &&
        !req.context.get(HAS_REFRESH_ATTEMPTED) &&
        authService.hasRefreshToken();

      if (!canTryRefresh) {
        return throwError(() => error);
      }

      return authService.refreshAccessToken().pipe(
        switchMap((response) => {
          const retriedRequest = addAccessToken(
            req.clone({
              context: new HttpContext()
                .set(HAS_REFRESH_ATTEMPTED, true)
                .set(SKIP_GLOBAL_ERROR, req.context.get(SKIP_GLOBAL_ERROR)),
            }),
            response.accessToken,
          );

          return next(retriedRequest);
        }),
        catchError((refreshError) => {
          authService.clearSession();
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
