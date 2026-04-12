package com.example.warehouse_api.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank(message = "First name is required.")
        @Size(max = 100, message = "First name must be 100 characters or fewer.")
        String firstName,

        @NotBlank(message = "Last name is required.")
        @Size(max = 100, message = "Last name must be 100 characters or fewer.")
        String lastName,

        @NotBlank(message = "Email is required.")
        @Email(message = "Email must be valid.")
        @Size(max = 255, message = "Email must be 255 characters or fewer.")
        String email,

        @NotBlank(message = "Phone is required.")
        @Pattern(regexp = "^[0-9\\-+() ]{7,30}$", message = "Phone must contain only common phone characters.")
        String phone,

        @NotBlank(message = "Password is required.")
        @Size(min = 8, max = 100, message = "Password must be between 8 and 100 characters.")
        String password
) {
}
