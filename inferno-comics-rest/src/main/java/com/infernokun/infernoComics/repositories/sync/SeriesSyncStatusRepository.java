package com.infernokun.infernoComics.repositories.sync;

import com.infernokun.infernoComics.models.sync.SeriesSyncStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface SeriesSyncStatusRepository extends JpaRepository<SeriesSyncStatus, Long> {
    Optional<SeriesSyncStatus> findFirstBySeriesIdAndFolderPathAndUpdatedAtAfterOrderByUpdatedAtDesc(
            Long seriesId,
            String folderPath,
            LocalDateTime since
    );

    Optional<SeriesSyncStatus> findFirstBySeriesIdAndFolderPathOrderByLastSyncTimestampDesc(
            Long seriesId,
            String folderPath);

    Optional<SeriesSyncStatus> findTopBySeriesIdAndFolderPathOrderByUpdatedAtDesc(Long seriesId, String folderPath);
    List<SeriesSyncStatus> findBySyncStatus(SeriesSyncStatus.SyncStatus status);
    List<SeriesSyncStatus> findByLastSyncTimestampBefore(LocalDateTime timestamp);
}