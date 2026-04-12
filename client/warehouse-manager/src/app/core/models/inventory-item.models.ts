export interface InventoryItem {
  id?: number | string;
  sku: string;
  name: string;
  quantity: number;
  location: string;
  description?: string | null;
}

export interface UpsertInventoryItemRequest {
  sku: string;
  name: string;
  quantity: number;
  location: string;
  description?: string | null;
}
