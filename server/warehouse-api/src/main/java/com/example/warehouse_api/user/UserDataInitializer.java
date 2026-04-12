package com.example.warehouse_api.user;

import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.Set;

@Component
public class UserDataInitializer implements CommandLineRunner {

    private final UserAccountRepository userAccountRepository;
    private final PasswordEncoder passwordEncoder;

    public UserDataInitializer(UserAccountRepository userAccountRepository, PasswordEncoder passwordEncoder) {
        this.userAccountRepository = userAccountRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(String... args) {
        if (userAccountRepository.existsByEmailIgnoreCase("admin@example.com")) {
            return;
        }

        UserAccount admin = new UserAccount();
        admin.setFirstName("System");
        admin.setLastName("Admin");
        admin.setEmail("admin@example.com");
        admin.setPhone("5550000000");
        admin.setPasswordHash(passwordEncoder.encode("Admin123!"));
        admin.setEnabled(true);
        admin.setRoles(Set.of(UserRole.ADMIN, UserRole.USER));

        userAccountRepository.save(admin);
    }
}
