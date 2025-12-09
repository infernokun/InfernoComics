package com.infernokun.infernoComics.models.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.ToString;

@Getter
@ToString
@AllArgsConstructor
public enum State {
    PROCESSING("Processing"),
    COMPLETE("Completed"),
    REPLAYED("Replayed"),
    QUEUE("Queue"),
    ERROR("Error");

    private final String displayName;
}