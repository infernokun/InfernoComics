package com.infernokun.infernoComics.controllers;

import io.swagger.v3.oas.annotations.Operation;
import jakarta.annotation.PostConstruct;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

@RestController
@RequestMapping
public class InfernoComicsRestController extends BaseController {
    private Instant startTime;

    @PostConstruct
    public void init() {
        this.startTime = Instant.now();
    }

    @Operation(
            summary = "Redirect to Swagger UI",
            description = "This endpoint redirects to the Swagger UI page for API documentation."
    )
    @GetMapping("/")
    public ResponseEntity<Void> redirectToSwagger() {
        return ResponseEntity.status(302)
                .header("Location", "/inferno-comics-rest/swagger-ui.html")
                .build();
    }

    @Operation(
            summary = "Health Check",
            description = "Returns the current health status of the service, including uptime and status code."
    )
    @GetMapping("api/health")
    public ResponseEntity<Map<String, Object>> health() {
        Duration uptime = Duration.between(startTime, Instant.now());

        String formattedUptime = String.format("%dd %dh %dm %ds",
                uptime.toDaysPart(),
                uptime.toHoursPart(),
                uptime.toMinutesPart(),
                uptime.toSecondsPart()
        );

        Map<String, Object> response = Map.of(
                "success", Map.of(
                        "status_code", HttpStatus.OK,
                        "status", HttpStatus.OK.value(),
                        "uptime_format", formattedUptime,
                        "uptime", uptime
                )
        );
        return ResponseEntity.ok(response);
    }
}
