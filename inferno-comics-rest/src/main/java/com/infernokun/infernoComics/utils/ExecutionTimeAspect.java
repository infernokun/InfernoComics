package com.infernokun.infernoComics.utils;

import com.infernokun.infernoComics.models.ApiResponse;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

@Slf4j
@Aspect
@Component
public class ExecutionTimeAspect {

    @Around("@within(org.springframework.web.bind.annotation.RestController)")
    public Object measureExecutionTime(ProceedingJoinPoint joinPoint) throws Throwable {
        long startTime = System.currentTimeMillis();
        try {
            Object result = joinPoint.proceed();

            // Extract the response entity and add execution time
            if (result instanceof ResponseEntity<?> responseEntity) {
                Object body = responseEntity.getBody();

                if (body instanceof ApiResponse<?> apiResponse) {
                    ApiResponse<?> updatedResponse = ApiResponse.builder()
                            .code(apiResponse.getCode())
                            .message(apiResponse.getMessage())
                            .data(apiResponse.getData())
                            .type(apiResponse.getType())
                            .timestamp(LocalDateTime.now())
                            .timeMs(System.currentTimeMillis() - startTime)
                            .totalCount(apiResponse.getTotalCount() != null ? apiResponse.getTotalCount() : 0)
                            .currentPage(apiResponse.getCurrentPage() != null ? apiResponse.getCurrentPage() : 0)
                            .pageSize(apiResponse.getPageSize() != null ? apiResponse.getPageSize() : 0)
                            .build();

                    return ResponseEntity.status(responseEntity.getStatusCode()).body(updatedResponse);
                }
            }

            return result;
        } catch (Exception e) {
            log.error("Error in controller method: {}", joinPoint.getSignature().getName(), e);
            throw e;
        }
    }
}