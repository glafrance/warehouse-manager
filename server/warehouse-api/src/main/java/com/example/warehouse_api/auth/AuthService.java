package com.example.warehouse_api.auth;

import com.example.warehouse_api.auth.dto.AuthResponse;
import com.example.warehouse_api.auth.dto.AuthUserResponse;
import com.example.warehouse_api.auth.dto.LoginRequest;
import com.example.warehouse_api.auth.dto.RefreshTokenRequest;
import com.example.warehouse_api.auth.dto.RegisterRequest;
import com.example.warehouse_api.user.UserAccount;
import com.example.warehouse_api.user.UserAccountRepository;
import com.example.warehouse_api.user.UserRole;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class AuthService {

    private final UserAccountRepository userAccountRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;
    private final long refreshTokenDays;

    public AuthService(UserAccountRepository userAccountRepository,
                       RefreshTokenRepository refreshTokenRepository,
                       PasswordEncoder passwordEncoder,
                       JwtService jwtService,
                       AuthenticationManager authenticationManager,
                       @Value("${app.security.jwt.refresh-token-days}") long refreshTokenDays) {
        this.userAccountRepository = userAccountRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.authenticationManager = authenticationManager;
        this.refreshTokenDays = refreshTokenDays;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (userAccountRepository.existsByEmailIgnoreCase(request.email())) {
            throw new IllegalArgumentException("That email address is already registered.");
        }

        UserAccount user = new UserAccount();
        user.setFirstName(request.firstName().trim());
        user.setLastName(request.lastName().trim());
        user.setEmail(request.email().trim().toLowerCase());
        user.setPhone(request.phone().trim());
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setEnabled(true);
        user.setRoles(Set.of(UserRole.USER));

        UserAccount savedUser = userAccountRepository.save(user);
        RefreshToken refreshToken = createAndSaveRefreshToken(savedUser);

        return buildAuthResponse(savedUser, refreshToken.getToken());
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.email().trim().toLowerCase(), request.password())
            );
        } catch (Exception ex) {
            throw new BadCredentialsException("Email or password is incorrect.");
        }

        UserAccount user = userAccountRepository.findByEmailIgnoreCase(request.email().trim())
                .orElseThrow(() -> new BadCredentialsException("Email or password is incorrect."));

        refreshTokenRepository.deleteByUser(user);
        RefreshToken refreshToken = createAndSaveRefreshToken(user);

        return buildAuthResponse(user, refreshToken.getToken());
    }

    @Transactional
    public AuthResponse refresh(RefreshTokenRequest request) {
        RefreshToken existingToken = refreshTokenRepository.findByToken(request.refreshToken())
                .orElseThrow(() -> new BadCredentialsException("Refresh token is invalid."));

        if (existingToken.isRevoked() || existingToken.getExpiresAt().isBefore(Instant.now())) {
            throw new BadCredentialsException("Refresh token is expired or revoked.");
        }

        UserAccount user = existingToken.getUser();

        existingToken.setRevoked(true);
        refreshTokenRepository.save(existingToken);

        RefreshToken newRefreshToken = createAndSaveRefreshToken(user);
        return buildAuthResponse(user, newRefreshToken.getToken());
    }

    private RefreshToken createAndSaveRefreshToken(UserAccount user) {
        RefreshToken refreshToken = new RefreshToken();
        refreshToken.setToken(UUID.randomUUID().toString());
        refreshToken.setUser(user);
        refreshToken.setRevoked(false);
        refreshToken.setExpiresAt(Instant.now().plus(refreshTokenDays, ChronoUnit.DAYS));
        return refreshTokenRepository.save(refreshToken);
    }

    private AuthResponse buildAuthResponse(UserAccount user, String refreshToken) {
        String accessToken = jwtService.generateAccessToken(user);

        AuthUserResponse authUser = new AuthUserResponse(
                user.getId(),
                user.getFirstName(),
                user.getLastName(),
                user.getEmail(),
                user.getPhone(),
                user.getRoles().stream().map(Enum::name).collect(Collectors.toSet())
        );

        return new AuthResponse(
                accessToken,
                refreshToken,
                "Bearer",
                jwtService.getAccessTokenExpiresInSeconds(),
                authUser
        );
    }
}
