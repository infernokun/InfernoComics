package com.infernokun.infernoComics.models.sync;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
@Entity
@Table(name = "processed_files")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProcessedFile {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "series_id", nullable = false)
    private Long seriesId;

    @Column(name = "file_path", nullable = false, length = 500)
    private String filePath;

    @Column(name = "file_name", nullable = false)
    private String fileName;

    @Column(name = "file_etag")
    private String fileEtag;

    @Column(name = "file_size")
    private Long fileSize;

    @Column(name = "file_last_modified")
    private LocalDateTime fileLastModified;

    @CreationTimestamp
    @Column(name = "processed_at")
    private LocalDateTime processedAt;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "processing_status")
    private ProcessingStatus processingStatus = ProcessingStatus.PROCESSED;

    @Column(name = "session_id")
    private String sessionId;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    public enum ProcessingStatus {
        PROCESSED, FAILED, SKIPPED
    }

    @Table(uniqueConstraints = {
            @UniqueConstraint(columnNames = {"series_id", "file_path"})
    })
    public static class TableConstraints {}
}
