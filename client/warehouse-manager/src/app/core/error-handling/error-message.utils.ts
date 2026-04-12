import { HttpErrorResponse } from '@angular/common/http';

export function getErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const backendError = error.error;

    if (typeof backendError === 'string' && backendError.trim()) {
      return backendError;
    }

    if (backendError?.message && typeof backendError.message === 'string') {
      return backendError.message;
    }

    if (backendError?.error && typeof backendError.error === 'string') {
      return backendError.error;
    }

    if (Array.isArray(backendError?.errors) && backendError.errors.length > 0) {
      return backendError.errors.join(', ');
    }

    if (error.status === 0) {
      return 'The server could not be reached. Check your API URL, server status, or CORS settings.';
    }

    if (error.status === 401) {
      return 'You are not authorized for that action.';
    }

    if (error.status === 403) {
      return 'You do not have permission to access that resource.';
    }

    if (error.status === 404) {
      return 'The requested resource was not found.';
    }

    if (error.status >= 500) {
      return 'The server reported an internal error.';
    }

    return 'The request failed.';
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'An unexpected error occurred.';
}
