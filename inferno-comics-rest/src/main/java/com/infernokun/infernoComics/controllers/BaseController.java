package com.infernokun.infernoComics.controllers;

import com.infernokun.infernoComics.models.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
public abstract class BaseController {
    protected final Logger LOGGER = LoggerFactory.getLogger(this.getClass());

    protected <T> ResponseEntity<ApiResponse<T>> createSuccessResponse() {
        return ResponseEntity.ok(ApiResponse.success());
    }

    protected <T> ResponseEntity<ApiResponse<T>> createSuccessResponse(T data) {
        return ResponseEntity.ok(ApiResponse.success(data));
    }
    
    protected <T> ResponseEntity<ApiResponse<T>> createSuccessResponse(T data, String message) {
        return ResponseEntity.ok(ApiResponse.success(data, message));
    }

    protected <T> ResponseEntity<ApiResponse<T>> createSuccessResponse(String message) {
        return ResponseEntity.ok(ApiResponse.success(message));
    }

    protected <T> ResponseEntity<ApiResponse<T>> createSuccessResponse(
            T data, String message, Integer totalCount, Integer currentPage, Integer pageSize) {
        return ResponseEntity.ok(ApiResponse.success(data, message, totalCount, currentPage, pageSize));
    }

    protected <T> ResponseEntity<ApiResponse<T>> createErrorResponse(String message) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(ApiResponse.error(message));
    }

    protected <T> ResponseEntity<ApiResponse<T>> createNotFoundResponse(Class<T> classType) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.notFound(classType.getName() + " not found"));
    }
}
