import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { getErrorMessage } from '../../../../core/error-handling/error-message.utils';
import { InventoryItem, UpsertInventoryItemRequest } from '../../../../core/models/inventory-item.models';
import { InventoryService } from '../../../../core/services/inventory.service';

@Component({
  selector: 'app-inventory-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './inventory-page.component.html',
  styleUrl: './inventory-page.component.scss',
})
export class InventoryPageComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly inventoryService = inject(InventoryService);

  protected items: InventoryItem[] = [];
  protected loading = false;
  protected saving = false;
  protected submitError = '';
  protected editingItemId: string | number | null = null;

  protected readonly form = this.fb.group({
    sku: ['', [Validators.required, Validators.maxLength(40)]],
    name: ['', [Validators.required, Validators.maxLength(100)]],
    quantity: [0, [Validators.required, Validators.min(0)]],
    location: ['', [Validators.required, Validators.maxLength(80)]],
    description: ['', [Validators.maxLength(500)]],
  });

  ngOnInit(): void {
    this.loadItems();
  }

  protected loadItems(): void {
    this.loading = true;
    this.submitError = '';

    this.inventoryService.getItems().subscribe({
      next: (items) => {
        this.items = items;
      },
      error: (error) => {
        this.submitError = getErrorMessage(error);
        this.loading = false;
      },
      complete: () => {
        this.loading = false;
      },
    });
  }

  protected save(): void {
    this.submitError = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving = true;
    const payload: UpsertInventoryItemRequest = {
      sku: this.form.getRawValue().sku ?? '',
      name: this.form.getRawValue().name ?? '',
      quantity: Number(this.form.getRawValue().quantity ?? 0),
      location: this.form.getRawValue().location ?? '',
      description: this.form.getRawValue().description ?? '',
    };

    const request$ = this.editingItemId == null
      ? this.inventoryService.createItem(payload)
      : this.inventoryService.updateItem(this.editingItemId, payload);

    request$.subscribe({
      next: () => {
        this.resetForm();
        this.loadItems();
      },
      error: (error) => {
        this.submitError = getErrorMessage(error);
        this.saving = false;
      },
      complete: () => {
        this.saving = false;
      },
    });
  }

  protected editItem(item: InventoryItem): void {
    this.editingItemId = item.id ?? null;
    this.form.patchValue({
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      location: item.location,
      description: item.description ?? '',
    });
  }

  protected deleteItem(item: InventoryItem): void {
    if (item.id == null) {
      return;
    }

    const shouldDelete = window.confirm(`Delete inventory item "${item.name}"?`);
    if (!shouldDelete) {
      return;
    }

    this.inventoryService.deleteItem(item.id).subscribe({
      next: () => {
        if (this.editingItemId === item.id) {
          this.resetForm();
        }
        this.loadItems();
      },
      error: (error) => {
        this.submitError = getErrorMessage(error);
      },
    });
  }

  protected resetForm(): void {
    this.editingItemId = null;
    this.submitError = '';
    this.form.reset({
      sku: '',
      name: '',
      quantity: 0,
      location: '',
      description: '',
    });
  }

  protected hasError(controlName: string, errorName: string): boolean {
    const control = this.form.get(controlName);
    return !!control && control.touched && control.hasError(errorName);
  }
}
