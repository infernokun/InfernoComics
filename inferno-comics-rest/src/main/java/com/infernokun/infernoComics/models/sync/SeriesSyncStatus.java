package com.infernokun.infernoComics.models.sync;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "series_sync_status")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SeriesSyncStatus {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "series_id", nullable = false)
    private Long seriesId;

    @Column(name = "folder_path", nullable = false)
    private String folderPath;

    @Column(name = "last_sync_timestamp")
    private LocalDateTime lastSyncTimestamp;

    @Builder.Default
    @Column(name = "total_files_count")
    private Integer totalFilesCount = 0;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "sync_status")
    private SyncStatus syncStatus = SyncStatus.PENDING;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @CreationTimestamp
    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "session_id")
    private String sessionId;

    public enum SyncStatus {
        PENDING, IN_PROGRESS, COMPLETED, FAILED, EMPTY
    }
}