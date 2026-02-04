package com.infernokun.infernoComics.controllers;

import com.infernokun.infernoComics.models.ApiResponse;
import com.infernokun.infernoComics.services.StatsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/stats")
public class StatsController extends BaseController {

    private final StatsService statsService;

    @GetMapping("/collection")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getCollectionStats() {
        return createSuccessResponse(statsService.getCollectionStats());
    }
}
