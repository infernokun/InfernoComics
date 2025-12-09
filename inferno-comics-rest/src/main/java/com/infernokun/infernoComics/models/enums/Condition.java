package com.infernokun.infernoComics.models.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.ToString;

@Getter
@ToString
@AllArgsConstructor
public enum Condition {
    MINT, NEAR_MINT, VERY_FINE, FINE, VERY_GOOD, GOOD, FAIR, POOR
}