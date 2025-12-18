package com.infernokun.infernoComics.models;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Getter
@Setter
@ToString
@NoArgsConstructor
@AllArgsConstructor
@Table(name = "missing_issues")
public class MissingIssue {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "comic_vine_id")
    private String comicVineId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "series_id", nullable = false)
    private Series series;

    @Column(name = "issue_number", nullable = false)
    private String issueNumber;

    @Column(name = "expected_issue_name")
    private String expectedIssueName;

    @Column(name = "expected_cover_date")
    private String expectedCoverDate;

    @Column(name = "is_resolved")
    private boolean isResolved = false;

    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "resolved_issue_id")
    private Issue resolvedIssue;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "last_checked")
    private LocalDateTime lastChecked;

    public MissingIssue(Series series, String issueNumber) {
        this.series = series;
        this.issueNumber = issueNumber;
    }

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
        lastChecked = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public void markAsResolved(Issue issue) {
        this.isResolved = true;
        this.resolvedAt = LocalDateTime.now();
        this.resolvedIssue = issue;
    }
}