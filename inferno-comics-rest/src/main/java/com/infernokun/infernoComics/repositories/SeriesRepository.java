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

    List<Series> findByNameContainingIgnoreCaseOrPublisherContainingIgnoreCase(String name, String publisher);

    List<Series> findByPublisher(String publisher);

    List<Series> findByStartYear(Integer startYear);

    @Query("SELECT DISTINCT s FROM Series s LEFT JOIN FETCH s.issues")
    List<Series> findAllWithIssues();

    @Query("SELECT s FROM Series s LEFT JOIN FETCH s.issues WHERE s.id = :id")
    Optional<Series> findByIdWithIssues(@Param("id") Long id);

    Series findByComicVineId(String comicVineId);

    @Query(value = "SELECT * FROM series ORDER BY id DESC LIMIT :limit", nativeQuery = true)
    List<Series> findRecentSeries(@Param("limit") int limit);

    @Query("SELECT s.publisher, COUNT(s) FROM Series s GROUP BY s.publisher ORDER BY COUNT(s) DESC")
    List<Object[]> findPopularPublishers();

    @Query("SELECT s FROM Series s WHERE s.startYear BETWEEN :startYear AND :endYear ORDER BY s.startYear")
    List<Series> findByDecade(@Param("startYear") Integer startYear, @Param("endYear") Integer endYear);

    @Query("SELECT s FROM Series s WHERE s.comicVineId IS NOT NULL")
    List<Series> findSeriesWithComicVineId();
}