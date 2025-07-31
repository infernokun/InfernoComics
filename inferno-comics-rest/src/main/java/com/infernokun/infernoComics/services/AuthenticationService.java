package com.infernokun.infernoComics.services;

import com.infernokun.infernoComics.exceptions.AuthFailedException;
import com.infernokun.infernoComics.exceptions.TokenException;
import com.infernokun.infernoComics.exceptions.WrongPasswordException;
import com.infernokun.infernoComics.models.LoginResponse;
import com.infernokun.infernoComics.models.RegistrationRequest;
import com.infernokun.infernoComics.models.RefreshToken;
import com.infernokun.infernoComics.models.User;
import com.infernokun.infernoComics.repositories.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Objects;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthenticationService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final RefreshTokenService refreshTokenService;
    private final UserService userService;

    public boolean registerUser(RegistrationRequest user) {
        if (user == null || user.getUsername() == null || user.getPassword() == null) {
            throw new AuthFailedException("Username and password required!");
        }

        if (userService.existsByUsernameIgnoreCase(user.getUsername())) {
            throw new AuthFailedException("Username already exists!");
        }

        String encodedPassword = this.passwordEncoder.encode(user.getPassword());
        user.setPassword(encodedPassword);

        User newUser = new User(user.getUsername(), user.getPassword());

        userRepository.save(newUser);

        log.info("User registered: {}", newUser.getUsername());
        return true;
    }

    public LoginResponse login(String username, String password, HttpServletRequest request) {
        try {
            User user = userService.findByUsernameIgnoreCase(username)
                    .orElseThrow(() -> new BadCredentialsException("Invalid username or password"));


            Authentication auth = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(username, password)
            );

            User authenticatedUser = (User) auth.getPrincipal();

            Objects.requireNonNull(request, "HttpServletRequest cannot be null");
            String deviceInfo = Optional.ofNullable(request.getHeader("User-Agent")).orElse("");

            RefreshToken refreshToken = refreshTokenService.createRefreshToken(
                    authenticatedUser, deviceInfo, request);

            String accessToken = refreshTokenService.generateAccessToken(authenticatedUser);

            return new LoginResponse(accessToken, authenticatedUser, refreshToken.getToken());

        } catch (BadCredentialsException e) {
            log.error("LOGIN FAILED: Bad credentials for username: {}", username);
            throw new WrongPasswordException("Invalid username or password");
        } catch (AuthenticationException e) {
            log.error("LOGIN FAILED: Authentication exception for username: {}", username, e);
            throw new AuthFailedException("Authentication failed");
        } catch (Exception e) {
            log.error("LOGIN FAILED: Unexpected error for username: {}", username, e);
            throw e;
        }
    }

    public LoginResponse refreshToken(String refreshTokenString, HttpServletRequest request) {
        log.info("Refreshing token");

        // Validate refresh token and get new access token
        String newAccessToken = refreshTokenService.refreshAccessToken(refreshTokenString, request);

        // Get refresh token details
        RefreshToken refreshToken = refreshTokenService.findByToken(refreshTokenString);

        // Check if refresh token needs rotation
        RefreshToken finalRefreshToken = refreshTokenService.rotateRefreshTokenIfNeeded(refreshToken, request);

        log.info("Token refreshed for user: {}", refreshToken.getUser().getId());

        return new LoginResponse(newAccessToken, refreshToken.getUser(), finalRefreshToken.getToken());
    }

    public void logout(String refreshTokenString) {
        refreshTokenService.revokeSession(refreshTokenString, "User logout");
        log.info("User logged out");
    }

    public boolean isRefreshTokenValid(String refreshTokenString) {
        try {
            RefreshToken refreshToken = refreshTokenService.findByToken(refreshTokenString);
            return !refreshToken.isRevoked() && !refreshToken.isExpired();
        } catch (TokenException e) {
            return false;
        }
    }
}
