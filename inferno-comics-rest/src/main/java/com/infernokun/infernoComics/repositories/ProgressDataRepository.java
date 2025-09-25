package com.infernokun.infernoComics.repositories;

import com.infernokun.infernoComics.models.ProgressData;
import io.lettuce.core.dynamic.annotation.Param;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface ProgressDataRepository extends JpaRepository<ProgressData, Long> {
    Optional<ProgressData> findBySessionId(String sessionId);

    List<ProgressData> findBySeriesId(Long seriesId);

    @Query("SELECT p FROM ProgressData p WHERE " +
            "p.timeStarted >= :twentyFourHoursAgo OR " +
            "p.timeFinished >= :twentyFourHoursAgo")
    List<ProgressData> findByStartedOrFinishedWithinLast24Hours(@Param("twentyFourHoursAgo") LocalDateTime twentyFourHoursAgo);

}
