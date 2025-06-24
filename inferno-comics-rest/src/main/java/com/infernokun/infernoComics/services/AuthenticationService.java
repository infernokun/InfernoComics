package com.infernokun.amaterasu.services.alt;

import com.infernokun.amaterasu.exceptions.AuthFailedException;
import com.infernokun.amaterasu.exceptions.TokenException;
import com.infernokun.amaterasu.exceptions.WrongPasswordException;
import com.infernokun.amaterasu.models.entities.alt.LoginResponse;
import com.infernokun.amaterasu.models.entities.alt.RegistrationRequest;
import com.infernokun.amaterasu.models.entities.RefreshToken;
import com.infernokun.amaterasu.models.entities.User;
import com.infernokun.amaterasu.models.enums.Role;
import com.infernokun.amaterasu.repositories.UserRepository;
import com.infernokun.amaterasu.services.BaseService;
import com.infernokun.amaterasu.services.entity.RefreshTokenService;
import com.infernokun.amaterasu.services.entity.UserService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
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
public class AuthenticationService extends BaseService {
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
        newUser.setRole(Role.MEMBER);

        userRepository.save(newUser);

        LOGGER.info("User registered: {}", newUser.getUsername());
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
            LOGGER.error("LOGIN FAILED: Bad credentials for username: {}", username);
            throw new WrongPasswordException("Invalid username or password");
        } catch (AuthenticationException e) {
            LOGGER.error("LOGIN FAILED: Authentication exception for username: {}", username, e);
            throw new AuthFailedException("Authentication failed");
        } catch (Exception e) {
            LOGGER.error("LOGIN FAILED: Unexpected error for username: {}", username, e);
            throw e;
        }
    }

    /**
     * Refresh access token using refresh token
     */
    public LoginResponse refreshToken(String refreshTokenString, HttpServletRequest request) {
        LOGGER.info("Refreshing token");

        // Validate refresh token and get new access token
        String newAccessToken = refreshTokenService.refreshAccessToken(refreshTokenString, request);

        // Get refresh token details
        RefreshToken refreshToken = refreshTokenService.findByToken(refreshTokenString);

        // Check if refresh token needs rotation
        RefreshToken finalRefreshToken = refreshTokenService.rotateRefreshTokenIfNeeded(refreshToken, request);

        LOGGER.info("Token refreshed for user: {}", refreshToken.getUser().getId());

        return new LoginResponse(newAccessToken, refreshToken.getUser(), finalRefreshToken.getToken());
    }

    /**
     * Logout user by revoking refresh token
     */
    public void logout(String refreshTokenString) {
        refreshTokenService.revokeSession(refreshTokenString, "User logout");
        LOGGER.info("User logged out");
    }

    /**
     * Check if refresh token is valid (for client-side validation)
     */
    public boolean isRefreshTokenValid(String refreshTokenString) {
        try {
            RefreshToken refreshToken = refreshTokenService.findByToken(refreshTokenString);
            return !refreshToken.isRevoked() && !refreshToken.isExpired();
        } catch (TokenException e) {
            return false;
        }
    }
}
