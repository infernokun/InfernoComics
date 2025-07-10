package com.infernokun.infernoComics.models.gcd;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Getter
@Setter
@Table(name = "gcd_issue")
public class GCDIssue {

    @Id
    @Column(name = "id")
    private Long id;

    @Column(name = "number", length = 50)
    private String number;

    @Column(name = "volume", length = 50)
    private String volume;

    @Column(name = "no_volume")
    private Integer noVolume;

    @Column(name = "display_volume_with_number")
    private Integer displayVolumeWithNumber;

    @Column(name = "series_id")
    private Long seriesId;

    // Relationship to series
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "series_id", insertable = false, updatable = false)
    private GCDSeries series;

    @Column(name = "indicia_publisher_id")
    private Long indiciaPublisherId;

    @Column(name = "indicia_pub_not_printed")
    private Integer indiciaPubNotPrinted;

    @Column(name = "brand_id")
    private Long brandId;

    @Column(name = "no_brand")
    private Integer noBrand;

    @Column(name = "publication_date")
    private String publicationDate;

    @Column(name = "key_date", length = 10)
    private String keyDate;

    @Column(name = "sort_code")
    private Integer sortCode;

    @Column(name = "price")
    private String price;

    @Column(name = "page_count", precision = 10, scale = 3)
    private BigDecimal pageCount;

    @Column(name = "page_count_uncertain")
    private Integer pageCountUncertain;

    @Column(name = "indicia_frequency")
    private String indiciaFrequency;

    @Column(name = "no_indicia_frequency")
    private Integer noIndiciaFrequency;

    @Column(name = "editing", columnDefinition = "TEXT")
    private String editing;

    @Column(name = "no_editing")
    private Integer noEditing;

    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes;

    @Column(name = "created")
    private LocalDateTime created;

    @Column(name = "modified")
    private LocalDateTime modified;

    @Column(name = "deleted")
    private Integer deleted;

    @Column(name = "is_indexed")
    private Integer isIndexed;

    @Column(name = "isbn", length = 32)
    private String isbn;

    @Column(name = "valid_isbn", length = 13)
    private String validIsbn;

    @Column(name = "no_isbn")
    private Integer noIsbn;

    @Column(name = "variant_of_id")
    private Long variantOfId;

    @Column(name = "variant_name")
    private String variantName;

    @Column(name = "barcode", length = 38)
    private String barcode;

    @Column(name = "no_barcode")
    private Integer noBarcode;

    @Column(name = "title")
    private String title;

    @Column(name = "no_title")
    private Integer noTitle;

    @Column(name = "on_sale_date", length = 10)
    private String onSaleDate;

    @Column(name = "on_sale_date_uncertain")
    private Integer onSaleDateUncertain;

    @Column(name = "rating")
    private String rating;

    @Column(name = "no_rating")
    private Integer noRating;

    @Column(name = "volume_not_printed")
    private Integer volumeNotPrinted;

    @Column(name = "no_indicia_printer")
    private Integer noIndiciaPrinter;

    @Column(name = "variant_cover_status")
    private Integer variantCoverStatus;

    public String toString() {
        return "GcdIssue{" +
                "id=" + id +
                ", number='" + number + '\'' +
                ", title='" + title + '\'' +
                ", publicationDate='" + publicationDate + '\'' +
                ", seriesId=" + seriesId +
                '}';
    }
}