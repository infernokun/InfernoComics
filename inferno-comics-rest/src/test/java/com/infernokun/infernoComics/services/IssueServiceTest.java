package com.infernokun.infernoComics.services;

import com.infernokun.infernoComics.clients.InfernoComicsWebClient;
import com.infernokun.infernoComics.config.InfernoComicsConfig;
import com.infernokun.infernoComics.models.DescriptionGenerated;
import com.infernokun.infernoComics.models.Issue;
import com.infernokun.infernoComics.models.Series;
import com.infernokun.infernoComics.models.dto.IssueRequest;
import com.infernokun.infernoComics.models.enums.Condition;
import com.infernokun.infernoComics.repositories.IssueRepository;
import com.infernokun.infernoComics.repositories.MissingIssueRepository;
import com.infernokun.infernoComics.repositories.SeriesRepository;
import com.infernokun.infernoComics.services.gcd.GCDatabaseService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class IssueServiceTest {

    @Mock
    private IssueRepository issueRepository;

    @Mock
    private SeriesRepository seriesRepository;

    @Mock
    private ComicVineService comicVineService;

    @Mock
    private InfernoComicsConfig infernoComicsConfig;

    @Mock
    private InfernoComicsWebClient webClient;

    @Mock
    private DescriptionGeneratorService descriptionGeneratorService;

    @Mock
    private GCDatabaseService gcDatabaseService;

    @Mock
    private CacheManager cacheManager;

    @Mock
    private RecognitionService recognitionService;

    @Mock
    private Cache cache;

    @Mock
    private IssueService issueService;

    @Mock
    private MissingIssueRepository missingIssueRepository;

    @BeforeEach
    void setUp() {
        issueService = new IssueService(
                infernoComicsConfig,
                issueRepository,
                seriesRepository,
                missingIssueRepository,
                comicVineService,
                gcDatabaseService,
                recognitionService,
                descriptionGeneratorService,
                cacheManager,
                webClient
        );
    }

    // Helper methods for creating test data
    private Series createTestSeries() {
        Series series = new Series();
        series.setId(1L);
        series.setName("Spider-Man");
        series.setComicVineId("12345");
        series.setGcdIds(List.of("100", "101"));
        series.setDescription("Spider-Man Book!!!");
        series.setCreatedAt(LocalDateTime.now());
        series.setUpdatedAt(LocalDateTime.now());
        series.setStartYear(2012);
        series.setEndYear(2016);
        return series;
    }

    private Issue createTestIssue(Long id, String issueNumber, Series series) {
        Issue issue = new Issue();
        issue.setId(id);
        issue.setIssueNumber(issueNumber);
        issue.setTitle("Test Issue " + issueNumber);
        issue.setSeries(series);
        issue.setCreatedAt(LocalDateTime.now());
        issue.setIsKeyIssue(false);
        issue.setIsVariant(false);
        issue.setCondition(Condition.FAIR);
        issue.setCurrentValue(BigDecimal.valueOf(10.00));
        issue.setVariantCovers(new ArrayList<>());
        return issue;
    }

    @Nested
    @DisplayName("getAllIssues Tests")
    class GetAllIssuesTests {

        @Test
        @DisplayName("Should return cached issues when available")
        void shouldReturnCachedIssues() {
            Series series = createTestSeries();
            List<Issue> cachedIssues = List.of(
                    createTestIssue(1L, "1", series),
                    createTestIssue(2L, "2", series)
            );

            Cache.ValueWrapper wrapper = mock(Cache.ValueWrapper.class);
            when(wrapper.get()).thenReturn(cachedIssues);
            when(cacheManager.getCache("issue-list")).thenReturn(cache);
            when(cache.get("all-issues-list")).thenReturn(wrapper);

            List<Issue> result = issueService.getAllIssues();

            assertThat(result).hasSize(2);
            verify(issueRepository, never()).findAll();
        }

        @Test
        @DisplayName("Should fetch from repository when cache is empty")
        void shouldFetchFromRepositoryWhenCacheEmpty() {
            Series series = createTestSeries();
            List<Issue> issues = List.of(
                    createTestIssue(1L, "1", series),
                    createTestIssue(2L, "2", series)
            );

            when(cacheManager.getCache("issue-list")).thenReturn(cache);
            when(cache.get("all-issues-list")).thenReturn(null);
            when(issueRepository.findAll()).thenReturn(issues);

            List<Issue> result = issueService.getAllIssues();

            assertThat(result).hasSize(2);
            verify(issueRepository).findAll();
            verify(cache).put("all-issues-list", issues);
        }
    }

    @Nested
    @DisplayName("getIssueById Tests")
    class GetIssueByIdTests {

        @Test
        @DisplayName("Should return issue when found")
        void shouldReturnIssueWhenFound() {
            Series series = createTestSeries();
            Issue issue = createTestIssue(1L, "1", series);

            when(issueRepository.findById(1L)).thenReturn(Optional.of(issue));

            Issue result = issueService.getIssueById(1L);

            assertThat(result).isNotNull();
            assertThat(result.getId()).isEqualTo(1L);
            assertThat(result.getIssueNumber()).isEqualTo("1");
        }

        @Test
        @DisplayName("Should return null when issue not found")
        void shouldReturnNullWhenNotFound() {
            when(issueRepository.findById(999L)).thenReturn(Optional.empty());

            Issue result = issueService.getIssueById(999L);

            assertThat(result).isNull();
        }
    }

    @Nested
    @DisplayName("getIssuesBySeriesId Tests")
    class GetIssuesBySeriesIdTests {

        @Test
        @DisplayName("Should return sorted issues for series")
        void shouldReturnSortedIssues() {
            Series series = createTestSeries();
            List<Issue> issues = new ArrayList<>(List.of(
                    createTestIssue(3L, "10", series),
                    createTestIssue(1L, "1", series),
                    createTestIssue(2L, "2", series)
            ));

            when(issueRepository.findBySeriesIdOrderByIssueNumberAsc(1L)).thenReturn(issues);

            List<Issue> result = issueService.getIssuesBySeriesId(1L);

            assertThat(result).hasSize(3);
            assertThat(result.getFirst().getIssueNumber()).isEqualTo("1");
            assertThat(result.get(1).getIssueNumber()).isEqualTo("2");
            assertThat(result.get(2).getIssueNumber()).isEqualTo("10");
        }

        @Test
        @DisplayName("Should handle decimal issue numbers")
        void shouldHandleDecimalIssueNumbers() {
            Series series = createTestSeries();
            List<Issue> issues = new ArrayList<>(List.of(
                    createTestIssue(1L, "1", series),
                    createTestIssue(2L, "1.5", series),
                    createTestIssue(3L, "2", series)
            ));

            when(issueRepository.findBySeriesIdOrderByIssueNumberAsc(1L)).thenReturn(issues);

            List<Issue> result = issueService.getIssuesBySeriesId(1L);

            assertThat(result.getFirst().getIssueNumber()).isEqualTo("1");
            assertThat(result.get(1).getIssueNumber()).isEqualTo("1.5");
            assertThat(result.get(2).getIssueNumber()).isEqualTo("2");
        }

        @Test
        @DisplayName("Should handle variant suffixes in issue numbers")
        void shouldHandleVariantSuffixes() {
            Series series = createTestSeries();
            List<Issue> issues = new ArrayList<>(List.of(
                    createTestIssue(1L, "1", series),
                    createTestIssue(2L, "1A", series),
                    createTestIssue(3L, "1B", series),
                    createTestIssue(4L, "2", series)
            ));

            when(issueRepository.findBySeriesIdOrderByIssueNumberAsc(1L)).thenReturn(issues);

            List<Issue> result = issueService.getIssuesBySeriesId(1L);

            assertThat(result.getFirst().getIssueNumber()).isEqualTo("1");
            assertThat(result.get(1).getIssueNumber()).isEqualTo("1A");
            assertThat(result.get(2).getIssueNumber()).isEqualTo("1B");
            assertThat(result.get(3).getIssueNumber()).isEqualTo("2");
        }

        @Test
        @DisplayName("Should return empty list on exception")
        void shouldReturnEmptyListOnException() {
            when(issueRepository.findBySeriesIdOrderByIssueNumberAsc(1L))
                    .thenThrow(new RuntimeException("Database error"));

            List<Issue> result = issueService.getIssuesBySeriesId(1L);

            assertThat(result).isEmpty();
        }
    }

    @Nested
    @DisplayName("getKeyIssues Tests")
    class GetKeyIssuesTests {

        @Test
        @DisplayName("Should return only key issues")
        void shouldReturnKeyIssues() {
            Series series = createTestSeries();
            Issue keyIssue = createTestIssue(1L, "1", series);
            keyIssue.setIsKeyIssue(true);

            when(issueRepository.findKeyIssues()).thenReturn(List.of(keyIssue));

            List<Issue> result = issueService.getKeyIssues();

            assertThat(result).hasSize(1);
            assertThat(result.getFirst().getIsKeyIssue()).isTrue();
        }
    }

    @Nested
    @DisplayName("getVariantIssues Tests")
    class GetVariantIssuesTests {

        @Test
        @DisplayName("Should return only variant issues")
        void shouldReturnVariantIssues() {
            Series series = createTestSeries();
            Issue regularIssue = createTestIssue(1L, "1", series);
            Issue variantIssue = createTestIssue(2L, "1", series);
            variantIssue.setIsVariant(true);

            when(issueRepository.findAll()).thenReturn(List.of(regularIssue, variantIssue));

            List<Issue> result = issueService.getVariantIssues();

            assertThat(result).hasSize(1);
            assertThat(result.getFirst().getIsVariant()).isTrue();
        }
    }

    @Nested
    @DisplayName("getRecentIssues Tests")
    class GetRecentIssuesTests {

        @Test
        @DisplayName("Should return limited recent issues sorted by creation date")
        void shouldReturnLimitedRecentIssues() {
            Series series = createTestSeries();
            Issue older = createTestIssue(1L, "1", series);
            older.setCreatedAt(LocalDateTime.now().minusDays(2));

            Issue newer = createTestIssue(2L, "2", series);
            newer.setCreatedAt(LocalDateTime.now().minusDays(1));

            Issue newest = createTestIssue(3L, "3", series);
            newest.setCreatedAt(LocalDateTime.now());

            when(issueRepository.findAll()).thenReturn(List.of(older, newer, newest));

            List<Issue> result = issueService.getRecentIssues(2);

            assertThat(result).hasSize(2);
            assertThat(result.getFirst().getId()).isEqualTo(3L);
            assertThat(result.get(1).getId()).isEqualTo(2L);
        }
    }

    @Nested
    @DisplayName("searchIssues Tests")
    class SearchIssuesTests {

        @Test
        @DisplayName("Should search by title")
        void shouldSearchByTitle() {
            Series series = createTestSeries();
            Issue issue = createTestIssue(1L, "1", series);
            issue.setTitle("Amazing Fantasy");

            when(issueRepository.findAll()).thenReturn(List.of(issue));

            List<Issue> result = issueService.searchIssues("Fantasy", 10);

            assertThat(result).hasSize(1);
        }

        @Test
        @DisplayName("Should search by series name")
        void shouldSearchBySeriesName() {
            Series series = createTestSeries();
            Issue issue = createTestIssue(1L, "1", series);

            when(issueRepository.findAll()).thenReturn(List.of(issue));

            List<Issue> result = issueService.searchIssues("Spider", 10);

            assertThat(result).hasSize(1);
        }

        @Test
        @DisplayName("Should search by issue number")
        void shouldSearchByIssueNumber() {
            Series series = createTestSeries();
            Issue issue = createTestIssue(1L, "129", series);

            when(issueRepository.findAll()).thenReturn(List.of(issue));

            List<Issue> result = issueService.searchIssues("129", 10);

            assertThat(result).hasSize(1);
        }

        @Test
        @DisplayName("Should respect limit parameter")
        void shouldRespectLimit() {
            Series series = createTestSeries();
            List<Issue> issues = new ArrayList<>();
            for (int i = 1; i <= 10; i++) {
                issues.add(createTestIssue((long) i, String.valueOf(i), series));
            }

            when(issueRepository.findAll()).thenReturn(issues);

            List<Issue> result = issueService.searchIssues("Spider", 5);

            assertThat(result).hasSize(5);
        }
    }

    @Nested
    @DisplayName("getIssueStats Tests")
    class GetIssueStatsTests {

        @Test
        @DisplayName("Should calculate correct statistics")
        void shouldCalculateCorrectStats() {
            Series series = createTestSeries();

            Issue keyIssue = createTestIssue(1L, "1", series);
            keyIssue.setIsKeyIssue(true);
            keyIssue.setCurrentValue(BigDecimal.valueOf(100.00));

            Issue variantIssue = createTestIssue(2L, "2", series);
            variantIssue.setIsVariant(true);
            variantIssue.setCurrentValue(BigDecimal.valueOf(50.00));

            Issue regularIssue = createTestIssue(3L, "3", series);
            regularIssue.setCurrentValue(BigDecimal.valueOf(25.00));

            when(issueRepository.findAll()).thenReturn(List.of(keyIssue, variantIssue, regularIssue));

            Map<String, Object> stats = issueService.getIssueStats();

            assertThat(stats.get("totalIssues")).isEqualTo(3L);
            assertThat(stats.get("keyIssues")).isEqualTo(1L);
            assertThat(stats.get("variantIssues")).isEqualTo(1L);
            assertThat(stats.get("totalCollectionValue")).isEqualTo(175.0);
        }

        @Test
        @DisplayName("Should handle condition breakdown")
        void shouldHandleConditionBreakdown() {
            Series series = createTestSeries();

            Issue nmIssue = createTestIssue(1L, "1", series);
            nmIssue.setCondition(Condition.NEAR_MINT);

            Issue vfIssue = createTestIssue(2L, "2", series);
            vfIssue.setCondition(Condition.VERY_FINE);

            when(issueRepository.findAll()).thenReturn(List.of(nmIssue, vfIssue));

            Map<String, Object> stats = issueService.getIssueStats();

            @SuppressWarnings("unchecked")
            Map<String, Long> conditionBreakdown = (Map<String, Long>) stats.get("conditionBreakdown");

            assertThat(conditionBreakdown).containsEntry("NEAR_MINT", 1L);
            assertThat(conditionBreakdown).containsEntry("VERY_FINE", 1L);
        }
    }

    @Nested
    @DisplayName("createIssue Tests")
    class CreateIssueTests {

        @Test
        @DisplayName("Should create issue successfully")
        void shouldCreateIssue() {
            Series series = createTestSeries();
            IssueRequest request = mock(IssueRequest.class);
            when(request.getSeriesId()).thenReturn(series.getId());
            when(request.getIssueNumber()).thenReturn("1");
            when(request.getTitle()).thenReturn("Spider-Man");

            when(seriesRepository.findById(1L)).thenReturn(Optional.of(series));
            when(issueRepository.findByUploadedImageUrl(any())).thenReturn(Optional.empty());
            when(issueRepository.save(any(Issue.class))).thenAnswer(invocation -> {
                Issue saved = invocation.getArgument(0);
                saved.setId(1L);
                return saved;
            });
            when(issueRepository.countBySeriesId(1L)).thenReturn(1);
            setupCacheMocks();

            Issue result = issueService.createIssue(request);

            assertThat(result).isNotNull();
            assertThat(result.getIssueNumber()).isEqualTo("1");
            verify(issueRepository).save(any(Issue.class));
            verify(seriesRepository).updateIssuesOwnedCount(1L, 1);
        }

        @Test
        @DisplayName("Should throw exception when series not found")
        void shouldThrowExceptionWhenSeriesNotFound() {
            IssueRequest request = IssueRequest.builder()
                    .seriesId(999L)
                    .issueNumber("1")
                    .title("Spider-Man")
                    .build();

            when(seriesRepository.findById(999L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> issueService.createIssue(request))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Series with ID " + request.getSeriesId() + " not found");
        }

        @Test
        @DisplayName("Should generate description when enabled and not provided")
        void shouldGenerateDescription() {
            Series series = createTestSeries();
            IssueRequest request = mock(IssueRequest.class);
            when(request.getSeriesId()).thenReturn(series.getId());
            when(request.getIssueNumber()).thenReturn("1");
            when(request.getTitle()).thenReturn("Spider-Man");
            when(request.getDescription()).thenReturn(null);

            DescriptionGenerated generated = new DescriptionGenerated();
            generated.setDescription("Generated description");
            generated.setGenerated(true);

            when(seriesRepository.findById(1L)).thenReturn(Optional.of(series));
            when(issueRepository.findByUploadedImageUrl(any())).thenReturn(Optional.empty());
            when(infernoComicsConfig.isDescriptionGeneration()).thenReturn(true);
            when(descriptionGeneratorService.generateDescription(anyString(), anyString(), any(), any(), any()))
                    .thenReturn(generated);
            when(issueRepository.save(any(Issue.class))).thenAnswer(invocation -> {
                Issue saved = invocation.getArgument(0);
                saved.setId(1L);
                return saved;
            });
            when(issueRepository.countBySeriesId(1L)).thenReturn(1);
            setupCacheMocks();

            Issue result = issueService.createIssue(request);

            assertThat(result.getDescription()).isEqualTo("Generated description");
            assertThat(result.isGeneratedDescription()).isTrue();
        }
    }

    @Nested
    @DisplayName("createIssuesBulk Tests")
    class CreateIssuesBulkTests {

        @Test
        @DisplayName("Should create multiple issues in bulk")
        void shouldCreateMultipleIssues() {
            Series series = createTestSeries();
            List<IssueRequest> requests = List.of(
                    IssueRequest.builder()
                            .seriesId(1L)
                            .title("Spider-Man")
                            .issueNumber("1")
                            .build(),
                    IssueRequest.builder()
                            .seriesId(1L)
                            .title("Spider-Man")
                            .issueNumber("2")
                            .build(),
                    IssueRequest.builder()
                            .seriesId(1L)
                            .title("Spider-Man")
                            .issueNumber("3")
                            .build()
            );

            when(seriesRepository.findById(1L)).thenReturn(Optional.of(series));
            when(issueRepository.findByUploadedImageUrl(any())).thenReturn(Optional.empty());
            when(issueRepository.save(any(Issue.class))).thenAnswer(invocation -> {
                Issue saved = invocation.getArgument(0);
                saved.setId((long) (Math.random() * 1000));
                return saved;
            });
            when(issueRepository.countBySeriesId(1L)).thenReturn(3);
            setupCacheMocks();

            List<Issue> result = issueService.createIssuesBulk(requests.stream().toList());

            assertThat(result).hasSize(3);
            verify(issueRepository, times(3)).save(any(Issue.class));
            verify(seriesRepository, times(1)).updateIssuesOwnedCount(eq(1L), anyInt());
        }

        @Test
        @DisplayName("Should throw exception when issues have different series IDs")
        void shouldThrowExceptionForDifferentSeriesIds() {
            List<IssueRequest> requests = List.of(
                    IssueRequest.builder()
                            .seriesId(1L)
                            .title("Spider-Man")
                            .issueNumber("1")
                            .build(),
                    IssueRequest.builder()
                            .seriesId(2L)
                            .title("Spider-Man")
                            .issueNumber("2")
                            .build(),
                    IssueRequest.builder()
                            .seriesId(1L)
                            .title("Spider-Man")
                            .issueNumber("3")
                            .build()
            );

            assertThatThrownBy(() -> issueService.createIssuesBulk(requests))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("All issues must belong to the same series");
        }

        @Test
        @DisplayName("Should return empty list for empty request")
        void shouldReturnEmptyListForEmptyRequest() {
            List<Issue> result = issueService.createIssuesBulk(Collections.emptyList());

            assertThat(result).isEmpty();
            verify(issueRepository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("updateIssue Tests")
    class UpdateIssueTests {

        @Test
        @DisplayName("Should update issue successfully")
        void shouldUpdateIssue() {
            Series series = createTestSeries();
            Issue existingIssue = createTestIssue(1L, "1", series);

            IssueRequest request = new IssueRequest();
            request.setIssueNumber("1");
            request.setTitle("Updated Title");
            request.setDescription("Updated description");

            when(issueRepository.findById(1L)).thenReturn(Optional.of(existingIssue));
            when(issueRepository.save(any(Issue.class))).thenReturn(existingIssue);
            setupCacheMocks();

            Issue result = issueService.updateIssue(1L, request);

            assertThat(result).isNotNull();
            verify(issueRepository).save(any(Issue.class));
            verify(descriptionGeneratorService).evictIssueCache(any(Issue.class));
        }

        @Test
        @DisplayName("Should throw exception when issue not found")
        void shouldThrowExceptionWhenIssueNotFound() {
            IssueRequest request = new IssueRequest();

            when(issueRepository.findById(999L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> issueService.updateIssue(999L, request))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Issue with ID 999 not found");
        }
    }

    @Nested
    @DisplayName("deleteIssue Tests")
    class DeleteIssueTests {

        @Test
        @DisplayName("Should delete issue and update series count")
        void shouldDeleteIssue() {
            Series series = createTestSeries();
            Issue issue = createTestIssue(1L, "1", series);

            when(issueRepository.findById(1L)).thenReturn(Optional.of(issue));
            when(issueRepository.countBySeriesId(1L)).thenReturn(0);
            setupCacheMocks();

            issueService.deleteIssue(1L);

            verify(issueRepository).deleteById(1L);
            verify(seriesRepository).updateIssuesOwnedCount(1L, 0);
            verify(descriptionGeneratorService).evictIssueCache(issue);
        }

        @Test
        @DisplayName("Should throw exception when issue not found")
        void shouldThrowExceptionWhenDeletingNonExistent() {
            when(issueRepository.findById(999L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> issueService.deleteIssue(999L))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Issue with ID 999 not found");
        }
    }

    @Nested
    @DisplayName("deleteIssuesBulk Tests")
    class DeleteIssuesBulkTests {

        @Test
        @DisplayName("Should delete multiple issues in bulk")
        void shouldDeleteMultipleIssues() {
            Series series = createTestSeries();
            Issue issue1 = createTestIssue(1L, "1", series);
            Issue issue2 = createTestIssue(2L, "2", series);

            when(issueRepository.findById(1L)).thenReturn(Optional.of(issue1));
            when(issueRepository.existsById(1L)).thenReturn(true);
            when(issueRepository.existsById(2L)).thenReturn(true);
            when(issueRepository.countBySeriesId(1L)).thenReturn(0);
            setupCacheMocks();

            Issue.BulkDeleteResult result = issueService.deleteIssuesBulk(List.of(1L, 2L));

            assertThat(result.successful()).isEqualTo(2);
            assertThat(result.failed()).isEqualTo(0);
            verify(issueRepository, times(2)).deleteById(anyLong());
        }

        @Test
        @DisplayName("Should handle partial failures")
        void shouldHandlePartialFailures() {
            Series series = createTestSeries();
            Issue issue1 = createTestIssue(1L, "1", series);

            when(issueRepository.findById(1L)).thenReturn(Optional.of(issue1));
            when(issueRepository.existsById(1L)).thenReturn(true);
            when(issueRepository.existsById(2L)).thenReturn(false);
            when(issueRepository.countBySeriesId(1L)).thenReturn(0);
            setupCacheMocks();

            Issue.BulkDeleteResult result = issueService.deleteIssuesBulk(List.of(1L, 2L));

            assertThat(result.successful()).isEqualTo(1);
            assertThat(result.failed()).isEqualTo(1);
        }
    }

    @Nested
    @DisplayName("Variant Cover Tests")
    class VariantCoverTests {

        @Test
        @DisplayName("Should add variant cover to issue")
        void shouldAddVariantCover() {
            Series series = createTestSeries();
            Issue issue = createTestIssue(1L, "1", series);

            Issue.VariantCover variantCover = new Issue.VariantCover(
                    "variant-1",
                    "http://example.com/variant.jpg",
                    "Variant A",
                    String.valueOf(List.of("tag1", "tag2"))
            );

            when(issueRepository.findById(1L)).thenReturn(Optional.of(issue));
            when(issueRepository.save(any(Issue.class))).thenReturn(issue);
            setupCacheMocks();

            Issue result = issueService.addVariantCover(1L, variantCover);

            assertThat(result.getVariantCovers()).hasSize(1);
            verify(issueRepository).save(any(Issue.class));
        }

        @Test
        @DisplayName("Should remove variant cover from issue")
        void shouldRemoveVariantCover() {
            Series series = createTestSeries();
            Issue issue = createTestIssue(1L, "1", series);
            issue.setVariantCovers(new ArrayList<>(List.of(
                    new Issue.VariantCover("variant-1", "url1", "caption1", List.of().toString()),
                    new Issue.VariantCover("variant-2", "url2", "caption2", List.of().toString())
            )));
            issue.setIsVariant(true);

            when(issueRepository.findById(1L)).thenReturn(Optional.of(issue));
            when(issueRepository.save(any(Issue.class))).thenReturn(issue);
            setupCacheMocks();

            Issue result = issueService.removeVariantCover(1L, "variant-1");

            ArgumentCaptor<Issue> captor = ArgumentCaptor.forClass(Issue.class);
            verify(issueRepository).save(captor.capture());

            Issue savedIssue = captor.getValue();
            assertThat(savedIssue.getVariantCovers()).hasSize(1);
            assertThat(savedIssue.getVariantCovers().getFirst().getId()).isEqualTo("variant-2");
        }
    }

    @Nested
    @DisplayName("createIssuesFromComicVine Tests")
    class CreateIssuesFromComicVineTests {

        @Test
        @DisplayName("Should create issues from Comic Vine data")
        void shouldCreateIssuesFromComicVine() {
            Series series = createTestSeries();

            ComicVineService.ComicVineIssueDto cvIssue = new ComicVineService.ComicVineIssueDto();
            cvIssue.setId("cv-123");
            cvIssue.setIssueNumber("1");
            cvIssue.setName("First Issue");
            cvIssue.setDescription("Description");
            cvIssue.setImageUrl("http://example.com/image.jpg");

            when(seriesRepository.findById(1L)).thenReturn(Optional.of(series));
            when(comicVineService.searchIssues(series)).thenReturn(List.of(cvIssue));
            when(issueRepository.save(any(Issue.class))).thenAnswer(invocation -> {
                Issue saved = invocation.getArgument(0);
                saved.setId(1L);
                return saved;
            });
            when(issueRepository.countBySeriesId(1L)).thenReturn(1);
            setupCacheMocks();

            List<Issue> result = issueService.createIssuesFromComicVine(1L, List.of("cv-123"));

            assertThat(result).hasSize(1);
            verify(issueRepository).save(any(Issue.class));
        }

        @Test
        @DisplayName("Should throw exception when series has no Comic Vine ID")
        void shouldThrowExceptionWhenNoComicVineId() {
            Series series = createTestSeries();
            series.setComicVineId(null);

            when(seriesRepository.findById(1L)).thenReturn(Optional.of(series));

            assertThatThrownBy(() -> issueService.createIssuesFromComicVine(1L, List.of("cv-123")))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Series does not have a Comic Vine ID");
        }
    }

    @Nested
    @DisplayName("searchComicVineIssues Tests")
    class SearchComicVineIssuesTests {

        @Test
        @DisplayName("Should search Comic Vine when series has Comic Vine ID")
        void shouldSearchComicVine() {
            Series series = createTestSeries();

            ComicVineService.ComicVineIssueDto cvIssue = new ComicVineService.ComicVineIssueDto();
            cvIssue.setId("cv-123");
            cvIssue.setIssueNumber("1");

            when(seriesRepository.findById(1L)).thenReturn(Optional.of(series));
            when(comicVineService.searchIssues(series)).thenReturn(List.of(cvIssue));

            List<ComicVineService.ComicVineIssueDto> result = issueService.searchComicVineIssues(1L);

            assertThat(result).hasSize(1);
        }

        @Test
        @DisplayName("Should return empty list when series not found")
        void shouldReturnEmptyWhenSeriesNotFound() {
            when(seriesRepository.findById(999L)).thenReturn(Optional.empty());

            List<ComicVineService.ComicVineIssueDto> result = issueService.searchComicVineIssues(999L);

            assertThat(result).isEmpty();
        }
    }

    @Nested
    @DisplayName("clearAllIssueCaches Tests")
    class ClearAllIssueCachesTests {

        @Test
        @DisplayName("Should clear all issue-related caches")
        void shouldClearAllCaches() {
            when(cacheManager.getCache(anyString())).thenReturn(cache);

            issueService.clearAllIssueCaches();

            verify(cache, atLeast(9)).clear();
        }
    }

    // Helper method to setup cache mocks
    private void setupCacheMocks() {
        when(cacheManager.getCache(anyString())).thenReturn(cache);
    }

}