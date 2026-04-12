import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class GlobalErrorService {
  private readonly errorSubject = new BehaviorSubject<string | null>(null);

  readonly error$ = this.errorSubject.asObservable();

  set(message: string): void {
    this.errorSubject.next(message);
  }

  clear(): void {
    this.errorSubject.next(null);
  }
}
