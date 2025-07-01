package com.infernokun.infernoComics.models;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class DescriptionGenerated {
    private String description;
    private boolean generated;
}
