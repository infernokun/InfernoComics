package com.infernokun.infernoComics.models;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.datatype.jsr310.deser.LocalDateTimeDeserializer;
import com.fasterxml.jackson.datatype.jsr310.ser.LocalDateTimeSerializer;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Duration;
import java.time.LocalDateTime;

@Entity
@Table(name = "progress_data")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ProgressData {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    private State state;

    @Column(unique = true, nullable = false)
    private String sessionId;

    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd HH:mm:ss")
    @JsonDeserialize(using = LocalDateTimeDeserializer.class)
    @JsonSerialize(using = LocalDateTimeSerializer.class)
    private LocalDateTime timeStarted;

    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd HH:mm:ss")
    @JsonDeserialize(using = LocalDateTimeDeserializer.class)
    @JsonSerialize(using = LocalDateTimeSerializer.class)
    private LocalDateTime timeFinished;

    private Long seriesId;

    // New fields for enhanced tracking
    private Integer percentageComplete;

    private String currentStage;

    @Column(length = 1000)
    private String statusMessage;

    @Column(length = 2000)
    private String errorMessage;

    private String processType; // e.g., "single_image", "multiple_images", "folder_evaluation"

    private Integer totalItems; // Total images to process

    private Integer processedItems; // Images processed so far

    private Integer successfulItems; // Successfully processed images

    private Integer failedItems; // Failed images

    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd HH:mm:ss")
    @JsonDeserialize(using = LocalDateTimeDeserializer.class)
    @JsonSerialize(using = LocalDateTimeSerializer.class)
    private LocalDateTime lastUpdated; // Last time progress was updated

    // Auto-update lastUpdated on save
    @PrePersist
    @PreUpdate
    protected void onUpdate() {
        lastUpdated = LocalDateTime.now();
        if (timeStarted == null && state == State.PROCESSING) {
            timeStarted = LocalDateTime.now();
        }
        if (timeFinished == null && (state == State.COMPLETE || state == State.ERROR)) {
            timeFinished = LocalDateTime.now();
        }
    }

    // Calculate duration
    @JsonIgnore
    public Duration getDuration() {
        LocalDateTime start = timeStarted != null ? timeStarted : LocalDateTime.now();
        LocalDateTime end = timeFinished != null ? timeFinished : LocalDateTime.now();
        return Duration.between(start, end);
    }

    // Get duration in human readable format
    public String getFormattedDuration() {
        Duration duration = getDuration();
        long seconds = duration.getSeconds();
        long hours = seconds / 3600;
        long minutes = (seconds % 3600) / 60;
        long secs = seconds % 60;

        if (hours > 0) {
            return String.format("%02d:%02d:%02d", hours, minutes, secs);
        } else {
            return String.format("%02d:%02d", minutes, secs);
        }
    }

    // Check if session is stale (no updates for 5+ minutes while processing)
    @JsonIgnore
    public boolean isStale() {
        if (state != State.PROCESSING || lastUpdated == null) {
            return false;
        }
        return Duration.between(lastUpdated, LocalDateTime.now()).toMinutes() > 5;
    }

    public enum State {
        PROCESSING("Processing"),
        COMPLETE("Completed"),
        ERROR("Error");

        private final String displayName;

        State(String displayName) {
            this.displayName = displayName;
        }

        public String getDisplayName() {
            return displayName;
        }
    }

    // Constructors
    public ProgressData(String sessionId, Long seriesId, String processType) {
        this.sessionId = sessionId;
        this.seriesId = seriesId;
        this.processType = processType;
        this.state = State.PROCESSING;
        this.percentageComplete = 0;
        this.timeStarted = LocalDateTime.now();
        this.lastUpdated = LocalDateTime.now();
    }
}