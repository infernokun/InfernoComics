package com.infernokun.infernoComics.models;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
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
    private String sessionId;
    private LocalDateTime timeStarted;
    private LocalDateTime timeFinished;
    private Long seriesId;

    public enum State {
        PROCESSING,
        COMPLETE,
        ERROR
    }
}