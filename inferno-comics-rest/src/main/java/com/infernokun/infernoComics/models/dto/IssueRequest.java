package com.infernokun.infernoComics.models.dto;

import com.infernokun.infernoComics.models.Issue;
import com.infernokun.infernoComics.models.enums.Condition;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Setter
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IssueRequest {
    private Long seriesId;
    private String issueNumber;
    private String title;
    private String description;
    private LocalDate coverDate;
    private String imageUrl;
    private Condition condition;
    private BigDecimal purchasePrice;
    private BigDecimal currentValue;
    private LocalDate purchaseDate;
    private String notes;
    private String comicVineId;
    private Boolean isKeyIssue;
    private List<Issue.VariantCover> variantCovers;
    private Boolean hasVariants;
    private String uploadedImageUrl;
}