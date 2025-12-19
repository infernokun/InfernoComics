package com.infernokun.infernoComics.models.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.ToString;

@Getter
@ToString
@AllArgsConstructor
public enum State {
    PROCESSING("PROCESSING"),
    COMPLETED("COMPLETED"),
    REPLAYED("REPLAYED"),
    QUEUE("QUEUE"),
    ERROR("ERROR");

    private final String displayName;
}