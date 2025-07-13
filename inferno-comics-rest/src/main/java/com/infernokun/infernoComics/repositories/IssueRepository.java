package com.infernokun.infernoComics.repositories;

import com.infernokun.infernoComics.models.Issue;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

@Repository
public interface IssueRepository extends JpaRepository<Issue, Long> {

    // Find issues by series, ordered by issue number
    List<Issue> findBySeriesIdOrderByIssueNumberAsc(Long seriesId);

    @Query("SELECT c FROM Issue c WHERE c.isKeyIssue = true")
    List<Issue> findKeyIssues();

    Optional<Issue> findByComicVineId(String comicVineId);

    // Search methods
    List<Issue> findByTitleContainingIgnoreCaseOrDescriptionContainingIgnoreCase(String title, String description);

    // Recent additions (you'll need to add createdDate field to Issue entity)
    @Query("SELECT c FROM Issue c ORDER BY c.id DESC")
    List<Issue> findTopByOrderByCreatedDateDesc(@Param("limit") int limit);

    // Alternative recent method using ID as proxy for creation order
    @Query(value = "SELECT * FROM issues ORDER BY id DESC LIMIT :limit", nativeQuery = true)
    List<Issue> findRecentIssues(@Param("limit") int limit);

    // Value calculations
    @Query("SELECT SUM(c.purchasePrice) FROM Issue c")
    BigDecimal sumPurchasePrice();

    @Query("SELECT SUM(c.currentValue) FROM Issue c")
    BigDecimal sumCurrentValue();

    // Additional useful queries
    List<Issue> findBySeriesId(Long seriesId);

    @Query("SELECT c FROM Issue c WHERE c.condition = :condition")
    List<Issue> findByCondition(@Param("condition") String condition);

    @Query("SELECT c FROM Issue c WHERE c.purchasePrice BETWEEN :minPrice AND :maxPrice")
    List<Issue> findByPurchasePriceBetween(@Param("minPrice") BigDecimal minPrice, @Param("maxPrice") BigDecimal maxPrice);

    @Query("SELECT c FROM Issue c WHERE c.currentValue > c.purchasePrice")
    List<Issue> findProfitableIssues();

    // Count by series
    long countBySeriesId(Long seriesId);

    // Find comics without descriptions
    List<Issue> findBySeriesIdAndDescriptionIsNull(Long seriesId);

    @Query("SELECT c FROM Issue c WHERE c.description IS NULL OR c.description = ''")
    List<Issue> findByDescriptionIsNullOrDescriptionEmpty();
}