package com.infernokun.infernoComics.controllers;

import com.fasterxml.jackson.databind.JsonNode;
import com.infernokun.infernoComics.models.RecognitionConfig;
import com.infernokun.infernoComics.services.RecognitionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/recog")
public class RecognitionController {
    private final RecognitionService recognitionService;

    @GetMapping("/config")
    public ResponseEntity<RecognitionConfig> getRecognitionConfig() {
        return ResponseEntity.ok(recognitionService.getRecognitionConfig());
    }

    @PostMapping("/config")
    public ResponseEntity<Boolean> saveRecognitionConfig(@RequestBody RecognitionConfig config) {
        return ResponseEntity.ok(recognitionService.saveRecognitionConfig(config));
    }
}
