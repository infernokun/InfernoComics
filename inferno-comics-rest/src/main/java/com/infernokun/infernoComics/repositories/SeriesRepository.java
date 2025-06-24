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

    List<Series> findByNameContainingIgnoreCase(String name);

    List<Series> findByPublisherContainingIgnoreCase(String publisher);

    Optional<Series> findByComicVineId(String comicVineId);

    @Query("SELECT s FROM Series s WHERE s.startYear >= :year")
    List<Series> findByStartYearGreaterThanEqual(@Param("year") Integer year);

    @Query("SELECT s FROM Series s LEFT JOIN FETCH s.comicBooks WHERE s.id = :id")
    Optional<Series> findByIdWithComicBooks(@Param("id") Long id);
}