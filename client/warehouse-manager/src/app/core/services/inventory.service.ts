import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { InventoryItem, UpsertInventoryItemRequest } from '../models/inventory-item.models';

@Injectable({
  providedIn: 'root',
})
export class InventoryService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = environment.apiBaseUrl;

  getItems(): Observable<InventoryItem[]> {
    return this.http.get<InventoryItem[]>(`${this.apiBaseUrl}/inventory-items`);
  }

  createItem(payload: UpsertInventoryItemRequest): Observable<InventoryItem> {
    return this.http.post<InventoryItem>(`${this.apiBaseUrl}/inventory-items`, payload);
  }

  updateItem(id: string | number, payload: UpsertInventoryItemRequest): Observable<InventoryItem> {
    return this.http.put<InventoryItem>(`${this.apiBaseUrl}/inventory-items/${id}`, payload);
  }

  deleteItem(id: string | number): Observable<void> {
    return this.http.delete<void>(`${this.apiBaseUrl}/inventory-items/${id}`);
  }
}
