package com.infernokun.infernoComics.repositories;

import com.infernokun.infernoComics.models.ProgressData;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface ProgressDataRepository extends JpaRepository<ProgressData, Long> {
    // Returns the most recent entry if duplicates exist (ordered by timeStarted desc)
    @Query("SELECT p FROM ProgressData p WHERE p.sessionId = :sessionId ORDER BY p.timeStarted DESC")
    List<ProgressData> findAllBySessionId(@Param("sessionId") String sessionId);

    // Convenience method that returns the first (most recent) result
    default Optional<ProgressData> findBySessionId(String sessionId) {
        List<ProgressData> results = findAllBySessionId(sessionId);
        return results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
    }

    List<ProgressData> findBySeriesId(Long seriesId);

    @Query("SELECT p FROM ProgressData p WHERE p.timeStarted >= :fourteenDaysAgo OR p.timeFinished >= :fourteenDaysAgo")
    List<ProgressData> findWithinLast14Days(@Param("fourteenDaysAgo") LocalDateTime fourteenDaysAgo);

    @Modifying
    @Query("DELETE FROM ProgressData p WHERE p.sessionId = :sessionId")
    void deleteBySessionId(@Param("sessionId") String sessionId);

    @Modifying
    @Query("UPDATE ProgressData p SET p.state = 'ERROR', p.errorMessage = :errorMessage, " +
           "p.timeFinished = :timeFinished, p.lastUpdated = :timeFinished " +
           "WHERE p.sessionId = :sessionId")
    int updateStateToError(@Param("sessionId") String sessionId,
                           @Param("errorMessage") String errorMessage,
                           @Param("timeFinished") LocalDateTime timeFinished);
}
