package com.infernokun.infernoComics.repositories;

import com.infernokun.infernoComics.models.MissingIssue;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface MissingIssueRepository extends JpaRepository<MissingIssue, Long> {

    @Query("SELECT m FROM MissingIssue m WHERE m.dismissed = false")
    List<MissingIssue> findAllNotDismissed();

    @Query("SELECT m FROM MissingIssue m WHERE m.resolved = false")
    List<MissingIssue> findUnresolvedMissingIssues();

    @Query("SELECT m FROM MissingIssue m WHERE m.series.id = :seriesId AND m.comicVineId = :comicVineId")
    Optional<MissingIssue> findMissingIssueBySeriesIdAndComicVineId(Long seriesId, String comicVineId);
}
