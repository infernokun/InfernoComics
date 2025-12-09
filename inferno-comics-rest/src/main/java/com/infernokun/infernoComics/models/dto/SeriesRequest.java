package com.infernokun.infernoComics.models.dto;

import lombok.*;
import java.util.List;

@Setter
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SeriesRequest {
    private String name;
    private String description;
    private String publisher;
    private Integer startYear;
    private Integer endYear;
    private String imageUrl;
    private List<String> comicVineIds;
    private String comicVineId;
    private int issueCount;
    private int issuesAvailableCount;
    private boolean generatedDescription;
}