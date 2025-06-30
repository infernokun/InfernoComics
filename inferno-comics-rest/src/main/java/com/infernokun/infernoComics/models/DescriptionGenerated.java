package com.infernokun.infernoComics.models;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class DescriptionGenerated {
    private String description;
    private boolean generated;
}
