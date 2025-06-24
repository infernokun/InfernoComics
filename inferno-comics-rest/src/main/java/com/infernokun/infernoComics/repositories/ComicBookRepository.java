package com.infernokun.infernoComics.repositories;

import com.infernokun.infernoComics.models.ComicBook;
import com.infernokun.infernoComics.models.ComicBook.Condition;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

@Repository
public interface ComicBookRepository extends JpaRepository<ComicBook, Long> {

    List<ComicBook> findBySeriesId(Long seriesId);

    List<ComicBook> findBySeriesIdOrderByIssueNumberAsc(Long seriesId);

    List<ComicBook> findByCondition(Condition condition);

    List<ComicBook> findByIsKeyIssueTrue();

    Optional<ComicBook> findByComicVineId(String comicVineId);

    @Query("SELECT cb FROM ComicBook cb WHERE cb.series.id = :seriesId AND cb.issueNumber = :issueNumber")
    Optional<ComicBook> findBySeriesIdAndIssueNumber(@Param("seriesId") Long seriesId,
                                                     @Param("issueNumber") String issueNumber);

    @Query("SELECT cb FROM ComicBook cb WHERE cb.purchasePrice BETWEEN :minPrice AND :maxPrice")
    List<ComicBook> findByPurchasePriceBetween(@Param("minPrice") BigDecimal minPrice,
                                               @Param("maxPrice") BigDecimal maxPrice);

    @Query("SELECT COUNT(cb) FROM ComicBook cb WHERE cb.series.id = :seriesId")
    Long countBySeriesId(@Param("seriesId") Long seriesId);

    @Query("SELECT SUM(cb.purchasePrice) FROM ComicBook cb WHERE cb.series.id = :seriesId")
    BigDecimal sumPurchasePriceBySeriesId(@Param("seriesId") Long seriesId);
}