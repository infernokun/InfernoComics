package com.infernokun.infernoComics.utils;

import com.infernokun.infernoComics.models.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

public class AmaterasuConstants {
    public static String DEFAULT_SURROUND_TAG = "CTF{x}";

    public static <T> ResponseEntity<ApiResponse<T>> buildSuccessResponse(
            String message, T data, HttpStatus status) {
        return ResponseEntity.status(status)
                .body(ApiResponse.<T>builder()
                        .code(status.value())
                        .message(message)
                        .data(data)
                        .build());
    }

    public static String extractTokenFromRequest(HttpServletRequest request) {
        String authHeader = request.getHeader("Authorization");

        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            return authHeader.substring(7); // Remove "Bearer " prefix
        }

        return null;
    }
}
