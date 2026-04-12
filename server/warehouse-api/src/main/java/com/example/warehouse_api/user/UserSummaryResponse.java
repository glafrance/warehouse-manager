package com.example.warehouse_api.user;

public record UserSummaryResponse(
        Long id,
        String firstName,
        String lastName,
        String email,
        String phone
) {
}
