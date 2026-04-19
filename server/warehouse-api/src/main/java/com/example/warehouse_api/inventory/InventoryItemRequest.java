package com.example.warehouse_api.inventory;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public class InventoryItemRequest {

    @NotBlank(message = "SKU is required.")
    private String sku;

    @NotBlank(message = "Name is required.")
    private String name;

    @NotNull(message = "Quantity is required.")
    @PositiveOrZero(message = "Quantity must be zero or greater.")
    private Integer quantity;

    @NotBlank(message = "Location is required.")
    private String location;

    @Size(max = 1000, message = "Description must be 1000 characters or fewer.")
    private String description;

    public String getSku() {
        return sku;
    }

    public void setSku(String sku) {
        this.sku = sku;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public Integer getQuantity() {
        return quantity;
    }

    public void setQuantity(Integer quantity) {
        this.quantity = quantity;
    }

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }
}
