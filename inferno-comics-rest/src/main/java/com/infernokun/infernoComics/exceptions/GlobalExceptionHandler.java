package com.infernokun.infernoComics.exceptions;

import com.infernokun.infernoComics.models.ApiResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;

@ControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiResponse<String>> handleResourceNotFoundException(
            ResourceNotFoundException ex) {
        ApiResponse<String> response = ApiResponse.<String>builder()
                .code(HttpStatus.NOT_FOUND.value())
                .message("ResourceNotFoundException: " + ex.getMessage())
                .data(null)
                .build();
        return new ResponseEntity<>(response, HttpStatus.NOT_FOUND);
    }

    @ExceptionHandler(WrongPasswordException.class)
    public ResponseEntity<ApiResponse<String>> handleWrongPasswordException(WrongPasswordException ex) {
        ApiResponse<String> response = ApiResponse.<String>builder()
                .code(HttpStatus.UNAUTHORIZED.value())
                .message("WrongPasswordException: " + ex.getMessage())
                .data(null)
                .build();
        return new ResponseEntity<>(response, HttpStatus.UNAUTHORIZED);
    }

    @ExceptionHandler(AuthFailedException.class)
    public ResponseEntity<ApiResponse<Boolean>> handleAuthFailedException(AuthFailedException ex) {
        ApiResponse<Boolean> response = ApiResponse.<Boolean>builder()
                .code(HttpStatus.UNAUTHORIZED.value())
                .message("AuthFailedException: " + ex.getMessage())
                .data(false)
                .build();

        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .contentType(MediaType.APPLICATION_JSON)
                .body(response);
    }

    @ExceptionHandler(TokenException.class)
    public ResponseEntity<ApiResponse<Boolean>> handleTokenException(TokenException ex) {
        ApiResponse<Boolean> response = ApiResponse.<Boolean>builder()
                .code(HttpStatus.BAD_REQUEST.value())
                .message("TokenException: " + ex.getMessage())
                .data(false)
                .build();
        return new ResponseEntity<>(response, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(CryptoException.class)
    public ResponseEntity<ApiResponse<Boolean>> handleTokenException(CryptoException ex) {
        ApiResponse<Boolean> response = ApiResponse.<Boolean>builder()
                .code(HttpStatus.BAD_REQUEST.value())
                .message("CryptoException: " + ex.getMessage())
                .data(null)
                .build();
        return new ResponseEntity<>(response, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<ApiResponse<?>> handleRuntimeException(RuntimeException ex) {
        ApiResponse<?> response = ApiResponse.<String>builder()
                .code(HttpStatus.INTERNAL_SERVER_ERROR.value())
                .message("RuntimeException: " + ex.getMessage())
                .data(null)
                .build();
        return new ResponseEntity<>(response, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<?>> handleGeneralException(Exception ex) {
        ApiResponse<?> response = ApiResponse.<String>builder()
                .code(HttpStatus.INTERNAL_SERVER_ERROR.value())
                .message("Exception: " + ex.getMessage())
                .data(null)
                .build();
        return new ResponseEntity<>(response, HttpStatus.INTERNAL_SERVER_ERROR);
    }
}