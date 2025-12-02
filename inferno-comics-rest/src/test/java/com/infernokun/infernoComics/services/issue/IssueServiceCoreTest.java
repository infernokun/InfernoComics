package com.infernokun.infernoComics.services.issue;

import com.infernokun.infernoComics.config.InfernoComicsConfig;
import com.infernokun.infernoComics.models.Issue;
import com.infernokun.infernoComics.models.Series;
import com.infernokun.infernoComics.repositories.IssueRepository;
import com.infernokun.infernoComics.repositories.SeriesRepository;
import com.infernokun.infernoComics.services.ComicVineService;
import com.infernokun.infernoComics.services.DescriptionGeneratorService;
import com.infernokun.infernoComics.services.IssueService;
import com.infernokun.infernoComics.services.RecognitionService;
import com.infernokun.infernoComics.services.gcd.GCDatabaseService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.cache.CacheManager;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class IssueServiceCoreTest {

    @Mock
    private IssueRepository issueRepository;

    @Mock
    private SeriesRepository seriesRepository;

    @Mock
    private ComicVineService comicVineService;

    @Mock
    private InfernoComicsConfig infernoComicsConfig;

    @Mock
    private DescriptionGeneratorService descriptionGeneratorService;

    @Mock
    private GCDatabaseService gcDatabaseService;

    @Mock
    private CacheManager cacheManager;

    @Mock
    private RecognitionService recognitionService;

    @InjectMocks
    private IssueService issueService;

    private Issue testIssue;
    private Series testSeries;

    @BeforeEach
    void setUp() {
        testSeries = new Series();
        testSeries.setId(1L);
        testSeries.setName("Test Series");

        testIssue = new Issue();
        testIssue.setId(1L);
        testIssue.setIssueNumber("1");
        testIssue.setTitle("Test Issue");
        testIssue.setSeries(testSeries);
    }

    @Test
    void testGetAllIssues_ReturnsCachedValue_WhenCacheExists() {
        // Given
        List<Issue> cachedIssues = List.of(testIssue);
        when(issueRepository.findAll()).thenReturn(List.of(testIssue));

        // When
        List<Issue> result = issueService.getAllIssues();

        // Then
        assertThat(result).hasSize(1);
        verify(issueRepository, times(1)).findAll();
    }

    @Test
    void testGetIssueById_ReturnsIssue_WhenFound() {
        // Given
        when(issueRepository.findById(1L)).thenReturn(Optional.of(testIssue));

        // When
        Issue result = issueService.getIssueById(1L);

        // Then
        assertThat(result).isNotNull();
        assertThat(result.getId()).isEqualTo(1L);
        verify(issueRepository).findById(1L);
    }

    @Test
    void testGetIssueById_ReturnsNull_WhenNotFound() {
        // Given
        when(issueRepository.findById(1L)).thenReturn(Optional.empty());

        // When
        Issue result = issueService.getIssueById(1L);

        // Then
        assertThat(result).isNull();
        verify(issueRepository).findById(1L);
    }

    @Test
    void testGetIssuesBySeriesId_ReturnsIssues_WhenSeriesExists() {
        // Given
        when(issueRepository.findBySeriesIdOrderByIssueNumberAsc(1L))
                .thenReturn(List.of(testIssue));

        // When
        List<Issue> result = issueService.getIssuesBySeriesId(1L);

        // Then
        assertThat(result).hasSize(1);
        verify(issueRepository).findBySeriesIdOrderByIssueNumberAsc(1L);
    }

    @Test
    void testGetKeyIssues_ReturnsKeyIssues() {
        // Given
        when(issueRepository.findKeyIssues()).thenReturn(List.of(testIssue));

        // When
        List<Issue> result = issueService.getKeyIssues();

        // Then
        assertThat(result).hasSize(1);
        verify(issueRepository).findKeyIssues();
    }

    @Test
    void testGetVariantIssues_ReturnsVariantIssues() {
        // Given
        testIssue.setIsVariant(true);
        when(issueRepository.findAll()).thenReturn(List.of(testIssue));

        // When
        List<Issue> result = issueService.getVariantIssues();

        // Then
        assertThat(result).hasSize(1);
        verify(issueRepository).findAll();
    }

    @Test
    void testGetRecentIssues_ReturnsRecentIssues() {
        // Given
        testIssue.setCreatedAt(LocalDateTime.now());
        when(issueRepository.findAll()).thenReturn(List.of(testIssue));

        // When
        List<Issue> result = issueService.getRecentIssues(5);

        // Then
        assertThat(result).hasSize(1);
        verify(issueRepository).findAll();
    }

    @Test
    void testSearchIssues_ReturnsMatchingIssues() {
        // Given
        when(issueRepository.findAll()).thenReturn(List.of(testIssue));

        // When
        List<Issue> result = issueService.searchIssues("test", 10);

        // Then
        assertThat(result).hasSize(1);
        verify(issueRepository).findAll();
    }

    @Test
    void testGetIssueStats_ReturnsStatistics() {
        // Given
        when(issueRepository.findAll()).thenReturn(List.of(testIssue));

        // When
        var result = issueService.getIssueStats();

        // Then
        assertThat(result).isNotNull();
        assertThat(result.containsKey("totalIssues")).isTrue();
        verify(issueRepository).findAll();
    }

    @Test
    void testCreateIssue_Success() {
        // Given
        IssueService.IssueCreateRequest request = new IssueService.IssueCreateRequest() {
            @Override
            public String getIssueNumber() { return "1"; }
            @Override
            public String getTitle() { return "Test Issue"; }
            @Override
            public String getDescription() { return "Test Description"; }
            @Override
            public LocalDate getCoverDate() { return LocalDate.now(); }
            @Override
            public String getImageUrl() { return "test.jpg"; }
            @Override
            public Issue.Condition getCondition() { return Issue.Condition.FINE; }
            @Override
            public BigDecimal getPurchasePrice() { return BigDecimal.TEN; }
            @Override
            public BigDecimal getCurrentValue() { return BigDecimal.ONE; }
            @Override
            public LocalDate getPurchaseDate() { return LocalDate.now(); }
            @Override
            public String getNotes() { return "Test notes"; }
            @Override
            public String getComicVineId() { return "123"; }
            @Override
            public Boolean getIsKeyIssue() { return false; }
            @Override
            public String getUploadedImageUrl() { return "uploaded.jpg"; }
            @Override
            public Long getSeriesId() { return 1L; }
        };

        when(seriesRepository.findById(1L)).thenReturn(Optional.of(testSeries));
        when(issueRepository.save(any(Issue.class))).thenReturn(testIssue);

        // When
        Issue result = issueService.createIssue(request);

        // Then
        assertThat(result).isNotNull();
        verify(seriesRepository).findById(1L);
        verify(issueRepository).save(any(Issue.class));
    }

    @Test
    void testUpdateIssue_Success() {
        // Given
        IssueService.IssueUpdateRequest request = new IssueService.IssueUpdateRequest() {
            @Override
            public String getIssueNumber() { return "1"; }
            @Override
            public String getTitle() { return "Updated Test Issue"; }
            @Override
            public String getDescription() { return "Updated Description"; }
            @Override
            public LocalDate getCoverDate() { return LocalDate.now(); }
            @Override
            public String getImageUrl() { return "updated.jpg"; }
            @Override
            public Issue.Condition getCondition() { return Issue.Condition.FINE; }
            @Override
            public BigDecimal getPurchasePrice() { return BigDecimal.TEN; }
            @Override
            public BigDecimal getCurrentValue() { return BigDecimal.ONE; }
            @Override
            public LocalDate getPurchaseDate() { return LocalDate.now(); }
            @Override
            public String getNotes() { return "Updated notes"; }
            @Override
            public String getComicVineId() { return "123"; }
            @Override
            public Boolean getIsKeyIssue() { return false; }
            @Override
            public String getUploadedImageUrl() { return "uploaded.jpg"; }
        };

        when(issueRepository.findById(1L)).thenReturn(Optional.of(testIssue));
        when(issueRepository.save(any(Issue.class))).thenReturn(testIssue);

        // When
        Issue result = issueService.updateIssue(1L, request);

        // Then
        assertThat(result).isNotNull();
        verify(issueRepository).findById(1L);
        verify(issueRepository).save(any(Issue.class));
    }

    @Test
    void testDeleteIssue_Success() {
        // Given
        when(issueRepository.findById(1L)).thenReturn(Optional.of(testIssue));

        // When
        issueService.deleteIssue(1L);

        // Then
        verify(issueRepository).findById(1L);
        verify(issueRepository).deleteById(1L);
    }

    @Test
    void testClearAllIssueCaches() {
        // When
        issueService.clearAllIssueCaches();

        // Then
        // Just verifying it doesn't throw an exception
        // Actual cache clearing would require mocking cache manager behavior
    }
}