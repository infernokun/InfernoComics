package com.infernokun.infernoComics.repositories;

import com.infernokun.infernoComics.models.ComicBook;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

@Repository
public interface ComicBookRepository extends JpaRepository<ComicBook, Long> {

    // Find comic books by series, ordered by issue number
    List<ComicBook> findBySeriesIdOrderByIssueNumberAsc(Long seriesId);

    Optional<ComicBook> findByComicVineId(String comicVineId);

    // Search methods
    List<ComicBook> findByTitleContainingIgnoreCaseOrDescriptionContainingIgnoreCase(String title, String description);

    // Recent additions (you'll need to add createdDate field to ComicBook entity)
    @Query("SELECT c FROM ComicBook c ORDER BY c.id DESC")
    List<ComicBook> findTopByOrderByCreatedDateDesc(@Param("limit") int limit);

    // Alternative recent method using ID as proxy for creation order
    @Query(value = "SELECT * FROM comic_books ORDER BY id DESC LIMIT :limit", nativeQuery = true)
    List<ComicBook> findRecentComicBooks(@Param("limit") int limit);

    // Value calculations
    @Query("SELECT SUM(c.purchasePrice) FROM ComicBook c")
    BigDecimal sumPurchasePrice();

    @Query("SELECT SUM(c.currentValue) FROM ComicBook c")
    BigDecimal sumCurrentValue();

    // Additional useful queries
    List<ComicBook> findBySeriesId(Long seriesId);

    @Query("SELECT c FROM ComicBook c WHERE c.condition = :condition")
    List<ComicBook> findByCondition(@Param("condition") String condition);

    @Query("SELECT c FROM ComicBook c WHERE c.purchasePrice BETWEEN :minPrice AND :maxPrice")
    List<ComicBook> findByPurchasePriceBetween(@Param("minPrice") BigDecimal minPrice, @Param("maxPrice") BigDecimal maxPrice);

    @Query("SELECT c FROM ComicBook c WHERE c.currentValue > c.purchasePrice")
    List<ComicBook> findProfitableComicBooks();

    // Count by series
    long countBySeriesId(Long seriesId);

    // Find comics without descriptions
    List<ComicBook> findBySeriesIdAndDescriptionIsNull(Long seriesId);

    @Query("SELECT c FROM ComicBook c WHERE c.description IS NULL OR c.description = ''")
    List<ComicBook> findByDescriptionIsNullOrDescriptionEmpty();
}