package com.infernokun.infernoComics.models;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import com.fasterxml.jackson.annotation.JsonBackReference;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Getter
@Setter
@Table(name = "comic_books")
@AllArgsConstructor
@NoArgsConstructor
public class ComicBook {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotNull(message = "Issue number is required")
    @Column(name = "issue_number", nullable = false)
    private String issueNumber;

    @Size(max = 255, message = "Title must not exceed 255 characters")
    @Column(name = "title")
    private String title;

    @Column(name = "description", length = 1000)
    private String description;

    @Column(name = "cover_date")
    private LocalDate coverDate;

    @Column(name = "image_url")
    private String imageUrl;

    @Enumerated(EnumType.STRING)
    @Column(name = "condition")
    private Condition condition;

    @Column(name = "purchase_price", precision = 10, scale = 2)
    private BigDecimal purchasePrice;

    @Column(name = "current_value", precision = 10, scale = 2)
    private BigDecimal currentValue;

    @Column(name = "purchase_date")
    private LocalDate purchaseDate;

    @Column(name = "notes", length = 500)
    private String notes;

    @Column(name = "comic_vine_id")
    private String comicVineId;

    @Column(name = "is_key_issue")
    private Boolean isKeyIssue = false;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "series_id", nullable = false)
    @JsonBackReference
    private Series series;

    private boolean generatedDescription = false;
    private boolean read = false;

    // Enum for comic book condition
    public enum Condition {
        MINT, NEAR_MINT, VERY_FINE, FINE, VERY_GOOD, GOOD, FAIR, POOR
    }

    public ComicBook(String issueNumber, String title, Series series) {
        this.issueNumber = issueNumber;
        this.title = title;
        this.series = series;
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