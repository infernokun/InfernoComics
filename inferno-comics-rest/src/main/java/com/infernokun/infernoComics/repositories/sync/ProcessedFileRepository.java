package com.infernokun.infernoComics.repositories.sync;

import com.infernokun.infernoComics.models.enums.State;
import com.infernokun.infernoComics.models.sync.ProcessedFile;
import io.lettuce.core.dynamic.annotation.Param;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

@Repository
public interface ProcessedFileRepository extends JpaRepository<ProcessedFile, Long> {

    @Query("SELECT pf.filePath FROM ProcessedFile pf WHERE pf.seriesId = :seriesId AND pf.processingStatus = 'PROCESSED'")
    Set<String> findProcessedFilePathsBySeriesId(@Param("seriesId") Long seriesId);

    Optional<ProcessedFile> findBySeriesIdAndFilePath(Long seriesId, String filePath);

    List<ProcessedFile> findBySeriesIdAndState(Long seriesId, State state);

    @Query("SELECT COUNT(pf) FROM ProcessedFile pf WHERE pf.seriesId = :seriesId AND pf.processingStatus = 'PROCESSED'")
    Long countProcessedFilesBySeriesId(@Param("seriesId") Long seriesId);

    void deleteBySeriesId(Long seriesId);

    @Query("SELECT pf FROM ProcessedFile pf WHERE pf.processedAt < :cutoffDate")
    List<ProcessedFile> findOldProcessedFiles(@Param("cutoffDate") LocalDateTime cutoffDate);

    @Query("SELECT pf FROM ProcessedFile pf WHERE pf.sessionId = :sessionId")
    List<ProcessedFile> findBySessionId(@Param("sessionId") String sessionId);

    Optional<ProcessedFile> findByFileEtag(String fileEtag);
    Optional<ProcessedFile> findByFileName(String fileName);

    @Query("SELECT pf FROM ProcessedFile pf WHERE pf.sessionId = :sessionId AND pf.fileName = :fileName")
    Optional<ProcessedFile> findBySessionIdAndFileName(@Param("sessionId") String sessionId, @Param("fileName") String fileName);

    @Modifying
    @Query("DELETE FROM ProcessedFile pf WHERE pf.sessionId = :sessionId")
    void deleteBySessionId(@Param("sessionId") String sessionId);
}