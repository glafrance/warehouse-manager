import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { GlobalErrorService } from '../error-handling/global-error.service';
import { getErrorMessage } from '../error-handling/error-message.utils';
import { SKIP_GLOBAL_ERROR } from '../http/http-context.tokens';

export const apiErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const globalErrorService = inject(GlobalErrorService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (!req.context.get(SKIP_GLOBAL_ERROR)) {
        globalErrorService.set(getErrorMessage(error));
      }

      if (error instanceof HttpErrorResponse) {
        console.error('API error:', {
          url: req.url,
          method: req.method,
          status: error.status,
          body: error.error,
        });
      } else {
        console.error('Unexpected error:', error);
      }

      return throwError(() => error);
    }),
  );
};
