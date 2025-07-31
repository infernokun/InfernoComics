package com.infernokun.infernoComics.controllers;

import com.infernokun.infernoComics.models.ApiResponse;
import com.infernokun.infernoComics.models.LoginResponse;
import com.infernokun.infernoComics.models.RefreshTokenRequest;
import com.infernokun.infernoComics.models.RegistrationRequest;
import com.infernokun.infernoComics.services.AuthenticationService;
import com.infernokun.infernoComics.services.RefreshTokenService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/auth")
public class AuthenticationController extends BaseController {
    private final AuthenticationService authenticationService;
    private final RefreshTokenService refreshTokenService;

    @PostMapping(value = "/register", consumes = "application/json")
    public ResponseEntity<ApiResponse<Boolean>> registerUser(@RequestBody RegistrationRequest registrationRequest) {
        return ResponseEntity.ok(ApiResponse.<Boolean>builder()
                .code(HttpStatus.OK.value())
                .message("User registered successfully.")
                .data(authenticationService.registerUser(registrationRequest))
                .build());
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<LoginResponse>> login(
            @RequestBody RegistrationRequest credentials,
            HttpServletRequest request) {

        LoginResponse response = authenticationService.login(
                credentials.getUsername(),
                credentials.getPassword(),
                request);

        return ResponseEntity.ok(ApiResponse.<LoginResponse>builder()
                .code(HttpStatus.OK.value())
                .message("Login successful")
                .data(response)
                .build());
    }

    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<LoginResponse>> refreshToken(
            @RequestBody RefreshTokenRequest request,
            HttpServletRequest httpRequest) {

        LoginResponse response = authenticationService.refreshToken(
                request.getRefreshToken(), httpRequest);

        return ResponseEntity.ok(ApiResponse.<LoginResponse>builder()
                .code(HttpStatus.OK.value())
                .message("Token refreshed successfully")
                .data(response)
                .build());
    }

    @PostMapping("/refresh/validate")
    public ResponseEntity<ApiResponse<Boolean>> validateRefreshToken(
            @RequestBody RefreshTokenRequest request) {

        boolean isValid = authenticationService.isRefreshTokenValid(request.getRefreshToken());

        return ResponseEntity.ok(ApiResponse.<Boolean>builder()
                .code(HttpStatus.OK.value())
                .message("Token validation complete")
                .data(isValid)
                .build());
    }

    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<String>> logout(@RequestBody RefreshTokenRequest request) {
        authenticationService.logout(request.getRefreshToken());

        return ResponseEntity.ok(ApiResponse.<String>builder()
                .code(HttpStatus.OK.value())
                .message("Logout successful")
                .data("User logged out successfully")
                .build());
    }
}
