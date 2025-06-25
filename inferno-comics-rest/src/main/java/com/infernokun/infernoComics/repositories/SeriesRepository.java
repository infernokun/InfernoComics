package com.infernokun.infernoComics.repositories;

import com.infernokun.infernoComics.models.Series;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SeriesRepository extends JpaRepository<Series, Long> {

    // Search methods
    List<Series> findByNameContainingIgnoreCaseOrPublisherContainingIgnoreCase(String name, String publisher);

    List<Series> findByPublisher(String publisher);

    List<Series> findByStartYear(Integer startYear);

    // Find by Comic Vine ID
    Series findByComicVineId(String comicVineId);

    // Recent series (using ID as proxy for creation order)
    @Query(value = "SELECT * FROM series ORDER BY id DESC LIMIT :limit", nativeQuery = true)
    List<Series> findRecentSeries(@Param("limit") int limit);

    // Popular publishers
    @Query("SELECT s.publisher, COUNT(s) FROM Series s GROUP BY s.publisher ORDER BY COUNT(s) DESC")
    List<Object[]> findPopularPublishers();

    // Series by decade
    @Query("SELECT s FROM Series s WHERE s.startYear BETWEEN :startYear AND :endYear ORDER BY s.startYear")
    List<Series> findByDecade(@Param("startYear") Integer startYear, @Param("endYear") Integer endYear);

    // Series with Comic Vine integration
    @Query("SELECT s FROM Series s WHERE s.comicVineId IS NOT NULL")
    List<Series> findSeriesWithComicVineId();
}