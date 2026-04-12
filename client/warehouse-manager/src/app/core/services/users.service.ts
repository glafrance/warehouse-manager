import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { UserSummary } from '../models/user.models';

@Injectable({
  providedIn: 'root',
})
export class UsersService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = environment.apiBaseUrl;

  getUsers(): Observable<UserSummary[]> {
    return this.http.get<UserSummary[]>(`${this.apiBaseUrl}/users`);
  }
}
