package com.infernokun.infernoComics.models.sync;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProcessingResult {
    private boolean hasNewFiles;
    private int totalFiles;
    private int newFilesCount;
    private int processedCount;
    private int failedCount;
    private String sessionId;
    private String errorMessage;

    public static ProcessingResult noNewFiles() {
        return ProcessingResult.builder()
                .hasNewFiles(false)
                .totalFiles(0)
                .newFilesCount(0)
                .processedCount(0)
                .failedCount(0)
                .build();
    }

    public static ProcessingResult success(int totalFiles, int newFiles, int processed, String sessionId) {
        return ProcessingResult.builder()
                .hasNewFiles(newFiles > 0)
                .totalFiles(totalFiles)
                .newFilesCount(newFiles)
                .processedCount(processed)
                .failedCount(0)
                .sessionId(sessionId)
                .build();
    }

    public static ProcessingResult error(String errorMessage) {
        return ProcessingResult.builder()
                .hasNewFiles(false)
                .errorMessage(errorMessage)
                .build();
    }
}