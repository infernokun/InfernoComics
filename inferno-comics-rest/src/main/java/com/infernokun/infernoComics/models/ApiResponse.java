package com.infernokun.infernoComics.models;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.datatype.jsr310.ser.LocalDateTimeSerializer;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.apache.hc.core5.http.HttpStatus;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties({"error", "success", "warning"})
public class ApiResponse<T> {
    @Builder.Default
    private Integer code = HttpStatus.SC_OK;
    private String message;
    private T data;
    private TYPE type;
    private Long timeMs;
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd HH:mm:ss")
    @JsonSerialize(using = LocalDateTimeSerializer.class)
    private LocalDateTime timestamp;
    private Integer totalCount;
    private Integer currentPage;
    private Integer pageSize;
    
    public enum TYPE {INFO, WARNING, ERROR, SUCCESS, NONE}

    public static <T> ApiResponse<T> success() {
        return ApiResponse.<T>builder()
                .code(HttpStatus.SC_OK)
                .message("Success")
                .type(TYPE.SUCCESS)
                .build();
    }

    public static <T> ApiResponse<T> success(T data) {
        return ApiResponse.<T>builder()
                .code(HttpStatus.SC_OK)
                .message("Success")
                .data(data)
                .type(TYPE.SUCCESS)
                .build();
    }

    public static <T> ApiResponse<T> success(String message) {
        return ApiResponse.<T>builder()
                .code(HttpStatus.SC_OK)
                .message(message)
                .type(TYPE.SUCCESS)
                .build();
    }
    
    public static <T> ApiResponse<T> success(T data, String message) {
        return ApiResponse.<T>builder()
                .code(HttpStatus.SC_OK)
                .message(message)
                .data(data)
                .type(TYPE.SUCCESS)
                .build();
    }
    public static <T> ApiResponse<T> success(T data, String message, int totalCount,  int currentPage, int pageSize) {

        return ApiResponse.<T>builder()
                .code(HttpStatus.SC_OK)
                .message(message)
                .data(data)
                .type(ApiResponse.TYPE.SUCCESS)
                .timestamp(LocalDateTime.now())
                .totalCount(totalCount)
                .currentPage(currentPage)
                .pageSize(pageSize)
                .build();
    }

    public static <T> ApiResponse<T> error(T data, String message) {
        return ApiResponse.<T>builder()
                .code(HttpStatus.SC_INTERNAL_SERVER_ERROR)
                .message(message)
                .data(data)
                .type(TYPE.ERROR)
                .build();
    }

    public static <T> ApiResponse<T> error(T data) {
        return ApiResponse.<T>builder()
                .code(HttpStatus.SC_INTERNAL_SERVER_ERROR)
                .data(data)
                .type(TYPE.ERROR)
                .build();
    }

    public static <T> ApiResponse<T> error(String message) {
        return ApiResponse.<T>builder()
                .code(HttpStatus.SC_INTERNAL_SERVER_ERROR)
                .message(message)
                .type(TYPE.ERROR)
                .build();
    }
    
    public static <T> ApiResponse<T> error(String message, Integer code) {
        return ApiResponse.<T>builder()
                .code(code)
                .message(message)
                .type(TYPE.ERROR)
                .build();
    }
    
    public static <T> ApiResponse<T> warning(String message) {
        return ApiResponse.<T>builder()
                .code(HttpStatus.SC_ACCEPTED)
                .message(message)
                .type(TYPE.WARNING)
                .timestamp(LocalDateTime.now())
                .build();
    }

    public static <T> ApiResponse<T> info(String message) {
        return ApiResponse.<T>builder()
                .code(HttpStatus.SC_OK)
                .message(message)
                .type(TYPE.INFO)
                .timestamp(LocalDateTime.now())
                .build();
    }

    public static <T> ApiResponse<T> notFound(String message) {
        return ApiResponse.<T>builder()
                .code(HttpStatus.SC_NOT_FOUND)
                .message(message)
                .type(TYPE.INFO)
                .timestamp(LocalDateTime.now())
                .build();
    }

    public ApiResponse<T> withPagination(Integer totalCount, Integer currentPage, Integer pageSize) {
        this.totalCount = totalCount;
        this.currentPage = currentPage;
        this.pageSize = pageSize;
        return this;
    }

    public boolean isSuccess() {
        return type == TYPE.SUCCESS;
    }
    
    public boolean isError() {
        return type == TYPE.ERROR;
    }
    
    public boolean isWarning() {
        return type == TYPE.WARNING;
    }
    
    public boolean hasData() {
        return data != null;
    }
}
