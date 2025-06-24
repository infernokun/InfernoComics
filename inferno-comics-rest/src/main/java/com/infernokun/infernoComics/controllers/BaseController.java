package com.infernokun.amaterasu.controllers;

import com.infernokun.amaterasu.models.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
public abstract class BaseController {
    protected final Logger LOGGER = LoggerFactory.getLogger(this.getClass());

    protected <T> ResponseEntity<ApiResponse<T>> createSuccessResponse(T data, String message) {
        return ResponseEntity.ok(ApiResponse.<T>builder()
                .code(HttpStatus.OK.value())
                .message(message)
                .data(data)
                .build());
    }

    protected <T> ResponseEntity<ApiResponse<T>> createNotFoundResponse(Class<T> classType, String id) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.<T>builder()
                        .code(HttpStatus.NOT_FOUND.value())
                        .message(classType.getName() + " not found")
                        .build());
    }
}
