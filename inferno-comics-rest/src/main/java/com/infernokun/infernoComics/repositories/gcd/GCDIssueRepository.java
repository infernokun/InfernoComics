package com.infernokun.infernoComics.repositories.gcd;

import com.infernokun.infernoComics.models.gcd.GCDIssue;
import io.lettuce.core.dynamic.annotation.Param;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface GCDIssueRepository extends JpaRepository<GCDIssue, Long> {
    List<GCDIssue> findByPublicationDateContaining(String date);
    List<GCDIssue> findByTitleContainingIgnoreCase(String title);

    List<GCDIssue> findBySeries_NameContainingIgnoreCaseAndKeyDateContaining(String seriesName, String year);

    @Query("SELECT i FROM GCDIssue i WHERE LOWER(i.series.name) LIKE LOWER(CONCAT('%', :seriesName, '%')) AND i.keyDate LIKE %:year%")
    List<GCDIssue> findBySeriesNameAndYear(@Param("seriesName") String seriesName, @Param("year") String year);

    @Query("SELECT i FROM GCDIssue i WHERE i.series.id = :seriesId AND i.deleted = 0 ORDER BY i.sortCode")
    List<GCDIssue> findActiveIssuesBySeriesId(@Param("seriesId") Long seriesId);

    @Query("SELECT i FROM GCDIssue i WHERE LOWER(i.series.name) LIKE LOWER(%:seriesName%) AND i.deleted = 0")
    List<GCDIssue> findActiveIssuesBySeriesName(@Param("seriesName") String seriesName);

    List<GCDIssue> findBySeriesIdIn(List<Long> seriesIds);
}