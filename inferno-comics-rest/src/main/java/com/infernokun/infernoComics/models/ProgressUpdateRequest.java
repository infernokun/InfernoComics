package com.infernokun.infernoComics.models;

import lombok.*;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class ProgressUpdateRequest {
    private String sessionId;
    private String stage;
    private Integer progress;
    private String message;
    private String statusMessage;
    private Integer totalItems;
    private Integer processedItems;
    private Integer successfulItems;
    private Integer failedItems;
    private Integer percentageComplete;
    private String currentStage;

    // Constructor for basic updates
    public ProgressUpdateRequest(String sessionId, String stage, int progress, String message) {
        this.sessionId = sessionId;
        this.stage = stage;
        this.progress = progress;
        this.message = message;
    }

    // Constructor for enhanced updates
    public ProgressUpdateRequest(String sessionId, String stage, int progress, String message, Integer totalItems,
                                 Integer processedItems, Integer successfulItems, Integer failedItems) {
        this.sessionId = sessionId;
        this.stage = stage;
        this.progress = progress;
        this.message = message;
        this.totalItems = totalItems;
        this.processedItems = processedItems;
        this.successfulItems = successfulItems;
        this.failedItems = failedItems;
    }
}