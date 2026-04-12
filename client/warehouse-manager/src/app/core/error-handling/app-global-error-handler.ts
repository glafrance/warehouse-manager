import { ErrorHandler, Injectable, inject } from '@angular/core';

import { GlobalErrorService } from './global-error.service';
import { getErrorMessage } from './error-message.utils';

@Injectable()
export class AppGlobalErrorHandler implements ErrorHandler {
  private readonly globalErrorService = inject(GlobalErrorService);

  handleError(error: unknown): void {
    console.error(error);
    this.globalErrorService.set(getErrorMessage(error));
  }
}
