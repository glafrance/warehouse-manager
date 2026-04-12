package com.example.warehouse_api.common;

import com.example.warehouse_api.common.dto.CreateUserRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/demo/users")
public class ValidationDemoController {

    @PostMapping("/validate")
    public Map<String, String> validateCreateUser(@Valid @RequestBody CreateUserRequest request) {
        return Map.of(
                "message", "Validation passed",
                "email", request.getEmail(),
                "fullName", request.getFirstName() + " " + request.getLastName()
        );
    }
}
