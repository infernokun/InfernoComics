package com.infernokun.infernoComics.models.gcd;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

import java.time.LocalDateTime;
import java.util.List;

@Entity
@Getter
@Setter
@Table(name = "gcd_series")
public class GCDSeries {

    @Id
    @Column(name = "id")
    private Long id;

    @Column(name = "name")
    private String name;

    @Column(name = "sort_name")
    private String sortName;

    @Column(name = "format")
    private String format;

    @Column(name = "year_began")
    private Integer yearBegan;

    @Column(name = "year_began_uncertain")
    private Integer yearBeganUncertain;

    @Column(name = "year_ended")
    private Integer yearEnded;

    @Column(name = "year_ended_uncertain")
    private Integer yearEndedUncertain;

    @Column(name = "publication_dates")
    private String publicationDates;

    @Column(name = "first_issue_id")
    private Long firstIssueId;

    @Column(name = "last_issue_id")
    private Long lastIssueId;

    @Column(name = "is_current")
    private Integer isCurrent;

    @Column(name = "publisher_id")
    private Long publisherId;

    @Column(name = "country_id")
    private Long countryId;

    @Column(name = "language_id")
    private Long languageId;

    @Column(name = "tracking_notes", columnDefinition = "TEXT")
    private String trackingNotes;

    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes;

    @Column(name = "has_gallery")
    private Integer hasGallery;

    @Column(name = "issue_count")
    private Integer issueCount;

    @Column(name = "created")
    private LocalDateTime created;

    @Column(name = "modified")
    private LocalDateTime modified;

    @Column(name = "deleted")
    private Integer deleted;

    @Column(name = "has_indicia_frequency")
    private Integer hasIndiciaFrequency;

    @Column(name = "has_isbn")
    private Integer hasIsbn;

    @Column(name = "has_barcode")
    private Integer hasBarcode;

    @Column(name = "has_issue_title")
    private Integer hasIssueTitle;

    @Column(name = "has_volume")
    private Integer hasVolume;

    @Column(name = "is_comics_publication")
    private Integer isComicsPublication;

    @Column(name = "color")
    private String color;

    @Column(name = "dimensions")
    private String dimensions;

    @Column(name = "paper_stock")
    private String paperStock;

    @Column(name = "binding")
    private String binding;

    @Column(name = "publishing_format")
    private String publishingFormat;

    @Column(name = "has_rating")
    private Integer hasRating;

    @Column(name = "publication_type_id")
    private Long publicationTypeId;

    @Column(name = "is_singleton")
    private Integer isSingleton;

    @Column(name = "has_about_comics")
    private Integer hasAboutComics;

    @Column(name = "has_indicia_printer")
    private Integer hasIndiciaPrinter;

    @Column(name = "has_publisher_code_number")
    private Integer hasPublisherCodeNumber;

    @OneToMany(mappedBy = "series", fetch = FetchType.LAZY)
    private List<GCDIssue> issues;

    public String toString() {
        return "GcdSeries{" +
                "id=" + id +
                ", name='" + name + '\'' +
                ", yearBegan=" + yearBegan +
                ", yearEnded=" + yearEnded +
                ", issueCount=" + issueCount +
                '}';
    }
}