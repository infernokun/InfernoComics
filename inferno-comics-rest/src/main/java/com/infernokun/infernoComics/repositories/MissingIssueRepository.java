package com.infernokun.infernoComics.repositories;

import com.infernokun.infernoComics.models.MissingIssue;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface MissingIssueRepository extends JpaRepository<MissingIssue, Long> {

    Optional<MissingIssue> findBySeriesIdAndIssueNumber(Long seriesId, String issueNumber);

    List<MissingIssue> findBySeriesIdAndIsResolvedFalse(Long seriesId);

    List<MissingIssue> findByIsResolvedFalse();
}
