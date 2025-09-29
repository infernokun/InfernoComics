package com.infernokun.infernoComics.models;

import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.ToString;

@Getter
@ToString
@AllArgsConstructor
public enum StartedBy {
    MANUAL("MANUAL"),
    AUTOMATIC("AUTOMATIC");

    private final String value;

    @JsonValue
    final String value() {
        return this.value;
    }
}
