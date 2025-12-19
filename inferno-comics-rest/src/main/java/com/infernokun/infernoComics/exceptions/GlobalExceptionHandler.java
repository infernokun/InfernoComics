package com.infernokun.infernoComics.exceptions;

import com.infernokun.infernoComics.controllers.BaseController;
import com.infernokun.infernoComics.models.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.servlet.NoHandlerFoundException;

@Slf4j
@ControllerAdvice
public class GlobalExceptionHandler extends BaseController {

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiResponse<String>> handleResourceNotFoundException(
            ResourceNotFoundException ex) {
        return createErrorResponse(ex.getClass().getName() + ": " + ex.getMessage());
    }

    @ExceptionHandler(NoHandlerFoundException.class)
    public ResponseEntity<ApiResponse<String>> handleNoHandlerFoundException(NoHandlerFoundException ex) {
        return createErrorResponse(ex.getClass().getName() + ": " + ex.getMessage());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<?> handleIllegalArgumentException(IllegalArgumentException ex, HttpServletRequest request) {
        log.warn("Illegal argument in request to {}: {}", request.getRequestURI(), ex.getMessage());

        if (isSSERequest(request.getHeader("Accept"), request.getContentType(), request.getRequestURI())) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .contentType(MediaType.TEXT_PLAIN)
                    .body("data: {\"type\":\"error\",\"error\":\"" + escapeJson(ex.getMessage()) + "\"}\n\n");
        }

        return createErrorResponse(ex.getClass().getName() + ": " + ex.getMessage());
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<ApiResponse<String>> handleRuntimeException(RuntimeException ex) {
        return createErrorResponse(ex.getClass().getName() + ": " + ex.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> handleGeneralException(Exception ex, HttpServletRequest request) {
        log.error("Unhandled exception in request to {}: {}", request.getRequestURI(), ex.getMessage(), ex);

        // Check if this is an SSE request
        String accept = request.getHeader("Accept");
        String contentType = request.getContentType();

        if (isSSERequest(accept, contentType, request.getRequestURI())) {
            // For SSE requests, return a plain text error that can be sent as SSE
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .contentType(MediaType.TEXT_PLAIN)
                    .body("data: {\"type\":\"error\",\"error\":\"" + escapeJson(ex.getMessage()) + "\"}\n\n");
        }

        return createErrorResponse(ex.getClass().getName() + ": " + ex.getMessage());
    }

    private boolean isSSERequest(String accept, String contentType, String requestURI) {
        // Check various indicators that this is an SSE request
        return (accept != null && accept.contains("text/event-stream")) ||
                (contentType != null && contentType.contains("text/event-stream")) ||
                (requestURI != null && requestURI.contains("/progress")) ||
                (requestURI != null && requestURI.contains("/events"));
    }

    private String escapeJson(String input) {
        if (input == null) return "";
        return input.replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }
}