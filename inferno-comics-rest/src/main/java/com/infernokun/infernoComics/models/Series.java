package com.infernokun.infernoComics.models;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonManagedReference;
import com.infernokun.infernoComics.models.gcd.GCDCover;
import com.infernokun.infernoComics.utils.GCDCoverListConverter;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Getter
@Setter
@ToString
@NoArgsConstructor
@AllArgsConstructor
@Table(name = "series")
public class Series {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotBlank(message = "Series name is required")
    @Size(max = 255, message = "Series name must not exceed 255 characters")
    @Column(nullable = false)
    private String name;

    @Column(length = 10000)
    private String description;

    @Column(name = "publisher")
    private String publisher;

    @Column(name = "start_year")
    private Integer startYear;

    @Column(name = "end_year")
    private Integer endYear;

    @Column(name = "image_url")
    private String imageUrl;

    @Column(name = "comic_vine_id")
    private String comicVineId;

    @Column(name = "comic_vine_ids")
    private List<String> comicVineIds = new ArrayList<>();

    @Column(name = "gcd_ids")
    private List<String> gcdIds = new ArrayList<>();

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "cached_cover_urls", columnDefinition = "TEXT")
    @Convert(converter = GCDCoverListConverter.class)
    private List<GCDCover> cachedCoverUrls = new ArrayList<>();

    @Column(name = "last_cached_covers")
    private LocalDateTime lastCachedCovers;

    @OneToMany(mappedBy = "series", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @JsonManagedReference
    @JsonIgnore
    private List<Issue> issues = new ArrayList<>();

    private boolean generatedDescription = false;

    @Column(name = "issues_available_count")
    private int issuesAvailableCount = 0;

    @Column(name = "issues_owned_count")
    private int issuesOwnedCount = 0;

    public Series(String name, String description, String publisher) {
        this.name = name;
        this.description = description;
        this.publisher = publisher;
    }

    public Series(String name, int year) {
        this.name = name;
        this.startYear = year;
    }

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}