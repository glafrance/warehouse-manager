package com.example.warehouse_api.inventory;

import com.example.warehouse_api.common.ResourceNotFoundException;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class InventoryItemService {

    private final InventoryItemRepository inventoryItemRepository;

    public InventoryItemService(InventoryItemRepository inventoryItemRepository) {
        this.inventoryItemRepository = inventoryItemRepository;
    }

    public List<InventoryItem> findAll() {
        return inventoryItemRepository.findAll();
    }

    public InventoryItem findById(Long id) {
        return inventoryItemRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Inventory item not found with id: " + id));
    }

    public InventoryItem create(InventoryItemRequest request) {
        InventoryItem item = new InventoryItem();
        apply(item, request);
        return inventoryItemRepository.save(item);
    }

    public InventoryItem update(Long id, InventoryItemRequest request) {
        InventoryItem item = findById(id);
        apply(item, request);
        return inventoryItemRepository.save(item);
    }

    public void delete(Long id) {
        InventoryItem item = findById(id);
        inventoryItemRepository.delete(item);
    }

    private void apply(InventoryItem item, InventoryItemRequest request) {
        item.setSku(request.getSku());
        item.setName(request.getName());
        item.setQuantity(request.getQuantity());
        item.setLocation(request.getLocation());
        item.setDescription(request.getDescription());
    }
}
