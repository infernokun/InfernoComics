package com.infernokun.infernoComics.repositories.gcd;

import com.infernokun.infernoComics.models.gcd.GCDSeries;
import io.lettuce.core.dynamic.annotation.Param;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface GCDSeriesRepository extends JpaRepository<GCDSeries, Long> {
    List<GCDSeries> findByNameContainingIgnoreCase(String name);
    List<GCDSeries> findByYearBegan(Integer year);
    List<GCDSeries> findByYearBeganAndNameContainingIgnoreCase(Integer year, String name);
    @Query(value = "SELECT * FROM gcd_series WHERE name ILIKE :seriesName AND year_began = :yearBegan AND issue_count = :issueCount", nativeQuery = true)
    Optional<GCDSeries> findGCDSeriesWithComicVineSeries(@Param("seriesName") String seriesName,
                                                         @Param("yearBegan") int yearBegan,
                                                         @Param("issueCount") int issueCount);
}