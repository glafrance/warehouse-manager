package com.example.warehouse_api.auth.dto;

import java.util.Set;

public record AuthUserResponse(
        Long id,
        String firstName,
        String lastName,
        String email,
        String phone,
        Set<String> roles
) {
}
