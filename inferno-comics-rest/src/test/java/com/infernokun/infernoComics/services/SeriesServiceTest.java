package com.infernokun.infernoComics.services;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infernokun.infernoComics.config.InfernoComicsConfig;
import com.infernokun.infernoComics.models.Series;
import com.infernokun.infernoComics.repositories.IssueRepository;
import com.infernokun.infernoComics.repositories.SeriesRepository;
import com.infernokun.infernoComics.repositories.sync.ProcessedFileRepository;
import com.infernokun.infernoComics.services.gcd.GCDatabaseService;
import com.infernokun.infernoComics.services.sync.WeirdService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.modelmapper.ModelMapper;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;

import static org.hamcrest.MatcherAssert.assertThat;
import static reactor.core.publisher.Mono.when;

@ExtendWith(MockitoExtension.class)
class SeriesServiceTest {

    @Mock
    private SeriesRepository seriesRepository;

    @Mock
    private IssueRepository issueRepository;

    @Mock
    private ComicVineService comicVineService;

    @Mock
    private DescriptionGeneratorService descriptionGeneratorService;

    @Mock
    private GCDatabaseService gcDatabaseService;

    @Mock
    private ModelMapper modelMapper;

    @Mock
    private InfernoComicsConfig infernoComicsConfig;

    @Mock
    private ProgressService progressService;

    @Mock
    private CacheManager cacheManager;

    @Mock
    private WeirdService weirdService;

    @Mock
    private ProcessedFileRepository processedFileRepository;

    @Mock
    private Cache cache;

    private SeriesService seriesService;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        when(infernoComicsConfig.getRecognitionServerHost()).thenReturn("localhost");
        when(infernoComicsConfig.getRecognitionServerPort()).thenReturn(8080);

        seriesService = new SeriesService(
                seriesRepository,
                issueRepository,
                comicVineService,
                descriptionGeneratorService,
                gcDatabaseService,
                modelMapper,
                infernoComicsConfig,
                progressService,
                cacheManager,
                weirdService,
                processedFileRepository
        );

        objectMapper = new ObjectMapper();
    }

    // Helper methods for creating test data
    private Series createTestSeries(Long id, String name) {
        Series series = new Series();
        series.setId(id);
        series.setName(name);
        series.setPublisher("Marvel");
        series.setStartYear(2020);
        series.setEndYear(2023);
        series.setComicVineId("12345");
        series.setComicVineIds(new ArrayList<>(List.of("12345")));
        series.setGcdIds(new ArrayList<>(List.of("100")));
        series.setIssues(new ArrayList<>());
        series.setIssuesOwnedCount(0);
        series.setIssuesAvailableCount(10);
        series.setCachedCoverUrls(new ArrayList<>());
        return series;
    }

    private Issue createTestIssue(Long id, String issueNumber, Series series) {
        Issue issue = new Issue();
        issue.setId(id);
        issue.setIssueNumber(issueNumber);
        issue.setTitle("Test Issue " + issueNumber);
        issue.setSeries(series);
        issue.setCreatedAt(LocalDateTime.now());
        return issue;
    }

    private ComicVineService.ComicVineSeriesDto createComicVineSeriesDto(String id, String name) {
        ComicVineService.ComicVineSeriesDto dto = new ComicVineService.ComicVineSeriesDto();
        dto.setId(id);
        dto.setName(name);
        dto.setPublisher("Marvel");
        dto.setStartYear(2020);
        dto.setEndYear(2023);
        dto.setIssueCount(10);
        dto.setImageUrl("http://example.com/image.jpg");
        dto.setDescription("Test description");
        return dto;
    }

    private GCDSeries createGCDSeries(Long id, String name) {
        GCDSeries gcdSeries = new GCDSeries();
        gcdSeries.setId(id);
        gcdSeries.setName(name);
        return gcdSeries;
    }

    @Nested
    @DisplayName("getAllSeries Tests")
    class GetAllSeriesTests {

        @Test
        @DisplayName("Should return cached series when available")
        void shouldReturnCachedSeries() {
            List<Series> cachedSeries = List.of(
                    createTestSeries(1L, "Spider-Man"),
                    createTestSeries(2L, "X-Men")
            );

            Cache.ValueWrapper wrapper = mock(Cache.ValueWrapper.class);
            when(wrapper.get()).thenReturn(cachedSeries);
            when(cacheManager.getCache("series-list")).thenReturn(cache);
            when(cache.get("all-series-list")).thenReturn(wrapper);

            List<Series> result = seriesService.getAllSeries();

            assertThat(result).hasSize(2);
            verify(seriesRepository, never()).findAll();
        }

        @Test
        @DisplayName("Should fetch from repository when cache is empty")
        void shouldFetchFromRepositoryWhenCacheEmpty() {
            Series series = createTestSeries(1L, "Spider-Man");
            List<Series> seriesList = List.of(series);

            when(cacheManager.getCache("series-list")).thenReturn(cache);
            when(cache.get("all-series-list")).thenReturn(null);
            when(seriesRepository.findAll()).thenReturn(seriesList);
            when(issueRepository.findBySeriesId(1L)).thenReturn(List.of());

            List<Series> result = seriesService.getAllSeries();

            assertThat(result).hasSize(1);
            verify(seriesRepository).findAll();
            verify(cache).put(eq("all-series-list"), anyList());
        }

        @Test
        @DisplayName("Should update issues owned count for each series")
        void shouldUpdateIssuesOwnedCount() {
            Series series = createTestSeries(1L, "Spider-Man");
            List<Issue> issues = List.of(
                    createTestIssue(1L, "1", series),
                    createTestIssue(2L, "2", series)
            );

            when(cacheManager.getCache("series-list")).thenReturn(cache);
            when(cache.get("all-series-list")).thenReturn(null);
            when(seriesRepository.findAll()).thenReturn(List.of(series));
            when(issueRepository.findBySeriesId(1L)).thenReturn(issues);

            List<Series> result = seriesService.getAllSeries();

            assertThat(result.get(0).getIssuesOwnedCount()).isEqualTo(2);
        }
    }

    @Nested
    @DisplayName("getSeriesById Tests")
    class GetSeriesByIdTests {

        @Test
        @DisplayName("Should return series when found")
        void shouldReturnSeriesWhenFound() {
            Series series = createTestSeries(1L, "Spider-Man");
            series.setIssues(List.of(createTestIssue(1L, "1", series)));

            when(seriesRepository.findByIdWithIssues(1L)).thenReturn(Optional.of(series));

            Series result = seriesService.getSeriesById(1L);

            assertThat(result).isNotNull();
            assertThat(result.getId()).isEqualTo(1L);
            assertThat(result.getName()).isEqualTo("Spider-Man");
            assertThat(result.getIssuesOwnedCount()).isEqualTo(1);
        }

        @Test
        @DisplayName("Should return null when series not found")
        void shouldReturnNullWhenNotFound() {
            when(seriesRepository.findByIdWithIssues(999L)).thenReturn(Optional.empty());

            Series result = seriesService.getSeriesById(999L);

            assertThat(result).isNull();
        }
    }

    @Nested
    @DisplayName("searchSeries Tests")
    class SearchSeriesTests {

        @Test
        @DisplayName("Should search by name or publisher")
        void shouldSearchByNameOrPublisher() {
            Series series = createTestSeries(1L, "Spider-Man");

            when(seriesRepository.findByNameContainingIgnoreCaseOrPublisherContainingIgnoreCase("spider", "spider"))
                    .thenReturn(List.of(series));

            List<Series> result = seriesService.searchSeries("spider");

            assertThat(result).hasSize(1);
            assertThat(result.get(0).getName()).isEqualTo("Spider-Man");
        }
    }

    @Nested
    @DisplayName("searchComicVineSeries Tests")
    class SearchComicVineSeriesTests {

        @Test
        @DisplayName("Should return Comic Vine search results")
        void shouldReturnComicVineResults() {
            ComicVineService.ComicVineSeriesDto dto = createComicVineSeriesDto("12345", "Spider-Man");

            when(comicVineService.searchSeries("Spider-Man")).thenReturn(List.of(dto));

            List<ComicVineService.ComicVineSeriesDto> result = seriesService.searchComicVineSeries("Spider-Man");

            assertThat(result).hasSize(1);
            assertThat(result.get(0).getName()).isEqualTo("Spider-Man");
        }

        @Test
        @DisplayName("Should return empty list on exception")
        void shouldReturnEmptyListOnException() {
            when(comicVineService.searchSeries("test"))
                    .thenThrow(new RuntimeException("API error"));

            List<ComicVineService.ComicVineSeriesDto> result = seriesService.searchComicVineSeries("test");

            assertThat(result).isEmpty();
        }
    }

    @Nested
    @DisplayName("searchComicVineIssues Tests")
    class SearchComicVineIssuesTests {

        @Test
        @DisplayName("Should search issues when series has Comic Vine ID")
        void shouldSearchIssuesWhenSeriesHasComicVineId() {
            Series series = createTestSeries(1L, "Spider-Man");
            ComicVineService.ComicVineIssueDto issueDto = new ComicVineService.ComicVineIssueDto();
            issueDto.setId("cv-1");
            issueDto.setIssueNumber("1");

            when(seriesRepository.findById(1L)).thenReturn(Optional.of(series));
            when(comicVineService.searchIssues(series)).thenReturn(List.of(issueDto));

            List<ComicVineService.ComicVineIssueDto> result = seriesService.searchComicVineIssues(1L);

            assertThat(result).hasSize(1);
        }

        @Test
        @DisplayName("Should return empty list when series not found")
        void shouldReturnEmptyWhenSeriesNotFound() {
            when(seriesRepository.findById(999L)).thenReturn(Optional.empty());

            List<ComicVineService.ComicVineIssueDto> result = seriesService.searchComicVineIssues(999L);

            assertThat(result).isEmpty();
        }

        @Test
        @DisplayName("Should return empty list when series has no Comic Vine ID")
        void shouldReturnEmptyWhenNoComicVineId() {
            Series series = createTestSeries(1L, "Spider-Man");
            series.setComicVineId(null);

            when(seriesRepository.findById(1L)).thenReturn(Optional.of(series));

            List<ComicVineService.ComicVineIssueDto> result = seriesService.searchComicVineIssues(1L);

            assertThat(result).isEmpty();
        }
    }

    @Nested
    @DisplayName("createSeries Tests")
    class CreateSeriesTests {

        @Test
        @DisplayName("Should create series successfully")
        void shouldCreateSeries() {
            TestSeriesCreateRequest request = new TestSeriesCreateRequest();
            request.setName("Spider-Man");
            request.setPublisher("Marvel");
            request.setStartYear(2020);

            Series mappedSeries = createTestSeries(null, "Spider-Man");
            mappedSeries.setId(null);

            when(modelMapper.map(request, Series.class)).thenReturn(mappedSeries);
            when(seriesRepository.save(any(Series.class))).thenAnswer(invocation -> {
                Series saved = invocation.getArgument(0);
                saved.setId(1L);
                return saved;
            });
            setupCacheMocks();

            Series result = seriesService.createSeries(request);

            assertThat(result).isNotNull();
            assertThat(result.getId()).isEqualTo(1L);
            verify(seriesRepository).save(any(Series.class));
        }

        @Test
        @DisplayName("Should generate description when not provided")
        void shouldGenerateDescription() {
            TestSeriesCreateRequest request = new TestSeriesCreateRequest();
            request.setName("Spider-Man");
            request.setPublisher("Marvel");
            request.setDescription(null);

            Series mappedSeries = createTestSeries(null, "Spider-Man");
            mappedSeries.setDescription(null);

            DescriptionGenerated generated = new DescriptionGenerated();
            generated.setDescription("Generated description");
            generated.setGenerated(true);

            when(modelMapper.map(request, Series.class)).thenReturn(mappedSeries);
            when(descriptionGeneratorService.generateDescription(anyString(), anyString(), anyString(), any(), any()))
                    .thenReturn(generated);
            when(seriesRepository.save(any(Series.class))).thenAnswer(invocation -> {
                Series saved = invocation.getArgument(0);
                saved.setId(1L);
                return saved;
            });
            setupCacheMocks();

            Series result = seriesService.createSeries(request);

            assertThat(result.getDescription()).isEqualTo("Generated description");
            assertThat(result.getGeneratedDescription()).isTrue();
        }

        @Test
        @DisplayName("Should map Comic Vine IDs to GCD IDs")
        void shouldMapComicVineToGcd() {
            TestSeriesCreateRequest request = new TestSeriesCreateRequest();
            request.setName("Spider-Man");
            request.setComicVineIds(List.of("12345"));

            Series mappedSeries = createTestSeries(null, "Spider-Man");
            mappedSeries.setGcdIds(new ArrayList<>());

            ComicVineService.ComicVineSeriesDto cvDto = createComicVineSeriesDto("12345", "Spider-Man");
            GCDSeries gcdSeries = createGCDSeries(100L, "Spider-Man");

            when(modelMapper.map(request, Series.class)).thenReturn(mappedSeries);
            when(comicVineService.getComicVineSeriesById(12345L)).thenReturn(cvDto);
            when(gcDatabaseService.findGCDSeriesWithComicVineSeries(anyString(), anyInt(), anyInt()))
                    .thenReturn(Optional.of(gcdSeries));
            when(seriesRepository.save(any(Series.class))).thenAnswer(invocation -> {
                Series saved = invocation.getArgument(0);
                saved.setId(1L);
                return saved;
            });
            setupCacheMocks();

            Series result = seriesService.createSeries(request);

            assertThat(result.getGcdIds()).contains("100");
        }
    }

    @Nested
    @DisplayName("updateSeries Tests")
    class UpdateSeriesTests {

        @Test
        @DisplayName("Should update series successfully")
        void shouldUpdateSeries() {
            Series existingSeries = createTestSeries(1L, "Spider-Man");

            TestSeriesUpdateRequest request = new TestSeriesUpdateRequest();
            request.setName("Amazing Spider-Man");
            request.setPublisher("Marvel");
            request.setDescription("Updated description");

            when(seriesRepository.findById(1L)).thenReturn(Optional.of(existingSeries));
            when(seriesRepository.save(any(Series.class))).thenReturn(existingSeries);
            setupCacheMocks();

            Series result = seriesService.updateSeries(1L, request);

            assertThat(result).isNotNull();
            verify(seriesRepository).save(any(Series.class));
            verify(seriesRepository).flush();
        }

        @Test
        @DisplayName("Should throw exception when series not found")
        void shouldThrowExceptionWhenNotFound() {
            TestSeriesUpdateRequest request = new TestSeriesUpdateRequest();

            when(seriesRepository.findById(999L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> seriesService.updateSeries(999L, request))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Series with ID 999 not found");
        }

        @Test
        @DisplayName("Should update GCD mappings when Comic Vine IDs change")
        void shouldUpdateGcdMappingsWhenComicVineIdsChange() {
            Series existingSeries = createTestSeries(1L, "Spider-Man");
            existingSeries.setComicVineIds(new ArrayList<>(List.of("12345")));

            TestSeriesUpdateRequestDto request = new TestSeriesUpdateRequestDto();
            request.setName("Spider-Man");
            request.setComicVineIds(List.of("12345", "67890"));

            ComicVineService.ComicVineSeriesDto cvDto = createComicVineSeriesDto("67890", "Spider-Man Vol 2");
            GCDSeries gcdSeries = createGCDSeries(200L, "Spider-Man Vol 2");

            when(seriesRepository.findById(1L)).thenReturn(Optional.of(existingSeries));
            when(comicVineService.getComicVineSeriesById(anyLong())).thenReturn(cvDto);
            when(gcDatabaseService.findGCDSeriesWithComicVineSeries(anyString(), anyInt(), anyInt()))
                    .thenReturn(Optional.of(gcdSeries));
            when(seriesRepository.save(any(Series.class))).thenReturn(existingSeries);
            setupCacheMocks();

            seriesService.updateSeries(1L, request);

            verify(comicVineService, atLeastOnce()).getComicVineSeriesById(anyLong());
        }

        @Test
        @DisplayName("Should clear GCD mappings when all Comic Vine IDs removed")
        void shouldClearGcdMappingsWhenComicVineIdsRemoved() {
            Series existingSeries = createTestSeries(1L, "Spider-Man");
            existingSeries.setComicVineIds(new ArrayList<>(List.of("12345")));
            existingSeries.setGcdIds(new ArrayList<>(List.of("100")));

            TestSeriesUpdateRequestDto request = new TestSeriesUpdateRequestDto();
            request.setName("Spider-Man");
            request.setComicVineIds(new ArrayList<>());

            when(seriesRepository.findById(1L)).thenReturn(Optional.of(existingSeries));
            when(seriesRepository.save(any(Series.class))).thenAnswer(invocation -> {
                Series saved = invocation.getArgument(0);
                return saved;
            });
            setupCacheMocks();

            Series result = seriesService.updateSeries(1L, request);

            ArgumentCaptor<Series> captor = ArgumentCaptor.forClass(Series.class);
            verify(seriesRepository).save(captor.capture());

            Series savedSeries = captor.getValue();
            assertThat(savedSeries.getGcdIds()).isEmpty();
            assertThat(savedSeries.getComicVineId()).isNull();
        }
    }

    @Nested
    @DisplayName("deleteSeries Tests")
    class DeleteSeriesTests {

        @Test
        @DisplayName("Should delete series successfully")
        void shouldDeleteSeries() {
            Series series = createTestSeries(1L, "Spider-Man");

            when(seriesRepository.existsById(1L)).thenReturn(true);
            when(seriesRepository.findById(1L)).thenReturn(Optional.of(series));
            setupCacheMocks();

            seriesService.deleteSeries(1L);

            verify(seriesRepository).deleteById(1L);
            verify(descriptionGeneratorService).evictSeriesCache(series);
        }

        @Test
        @DisplayName("Should throw exception when series not found")
        void shouldThrowExceptionWhenNotFound() {
            when(seriesRepository.existsById(999L)).thenReturn(false);

            assertThatThrownBy(() -> seriesService.deleteSeries(999L))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Series with ID 999 not found");
        }
    }

    @Nested
    @DisplayName("reverifyMetadata Tests")
    class ReverifyMetadataTests {

        @Test
        @DisplayName("Should reverify metadata and update GCD mappings")
        void shouldReverifyMetadata() {
            Series series = createTestSeries(1L, "Spider-Man");
            series.setComicVineIds(List.of("12345"));

            ComicVineService.ComicVineSeriesDto cvDto = createComicVineSeriesDto("12345", "Spider-Man");
            cvDto.setIssueCount(50);

            GCDSeries gcdSeries = createGCDSeries(100L, "Spider-Man");

            when(seriesRepository.findByIdWithIssues(1L)).thenReturn(Optional.of(series));
            when(comicVineService.getComicVineSeriesById(12345L)).thenReturn(cvDto);
            when(gcDatabaseService.findGCDSeriesWithComicVineSeries(anyString(), anyInt(), anyInt()))
                    .thenReturn(Optional.of(gcdSeries));
            when(seriesRepository.save(any(Series.class))).thenReturn(series);
            setupCacheMocks();

            Series result = seriesService.reverifyMetadata(1L);

            assertThat(result).isNotNull();
            verify(seriesRepository).save(any(Series.class));
        }

        @Test
        @DisplayName("Should throw exception when series not found")
        void shouldThrowExceptionWhenSeriesNotFound() {
            when(seriesRepository.findByIdWithIssues(999L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> seriesService.reverifyMetadata(999L))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Series with ID 999 not found");
        }

        @Test
        @DisplayName("Should handle missing Comic Vine data gracefully")
        void shouldHandleMissingComicVineData() {
            Series series = createTestSeries(1L, "Spider-Man");
            series.setComicVineIds(List.of("12345"));

            when(seriesRepository.findByIdWithIssues(1L)).thenReturn(Optional.of(series));
            when(comicVineService.getComicVineSeriesById(12345L)).thenReturn(null);
            when(seriesRepository.save(any(Series.class))).thenReturn(series);
            setupCacheMocks();

            Series result = seriesService.reverifyMetadata(1L);

            assertThat(result).isNotNull();
            assertThat(result.getIssuesAvailableCount()).isEqualTo(0);
        }
    }

    @Nested
    @DisplayName("getSeriesStats Tests")
    class GetSeriesStatsTests {

        @Test
        @DisplayName("Should calculate correct statistics")
        void shouldCalculateCorrectStats() {
            Series marvel2020 = createTestSeries(1L, "Spider-Man");
            marvel2020.setPublisher("Marvel");
            marvel2020.setStartYear(2020);
            marvel2020.setComicVineId("12345");

            Series dc2010 = createTestSeries(2L, "Batman");
            dc2010.setPublisher("DC");
            dc2010.setStartYear(2010);
            dc2010.setComicVineId(null);

            Series marvel2015 = createTestSeries(3L, "X-Men");
            marvel2015.setPublisher("Marvel");
            marvel2015.setStartYear(2015);
            marvel2015.setComicVineId("67890");

            when(seriesRepository.findAll()).thenReturn(List.of(marvel2020, dc2010, marvel2015));

            Map<String, Object> stats = seriesService.getSeriesStats();

            assertThat(stats.get("totalSeries")).isEqualTo(3L);
            assertThat(stats.get("seriesWithComicVineId")).isEqualTo(2L);

            @SuppressWarnings("unchecked")
            Map<String, Long> publisherBreakdown = (Map<String, Long>) stats.get("publisherBreakdown");
            assertThat(publisherBreakdown).containsEntry("Marvel", 2L);
            assertThat(publisherBreakdown).containsEntry("DC", 1L);

            @SuppressWarnings("unchecked")
            Map<String, Long> decadeBreakdown = (Map<String, Long>) stats.get("decadeBreakdown");
            assertThat(decadeBreakdown).containsEntry("2020s", 1L);
            assertThat(decadeBreakdown).containsEntry("2010s", 2L);
        }
    }

    @Nested
    @DisplayName("getRecentSeries Tests")
    class GetRecentSeriesTests {

        @Test
        @DisplayName("Should return recent series with limit")
        void shouldReturnRecentSeries() {
            List<Series> recentSeries = List.of(
                    createTestSeries(1L, "Spider-Man"),
                    createTestSeries(2L, "X-Men")
            );

            when(seriesRepository.findRecentSeries(5)).thenReturn(recentSeries);

            List<Series> result = seriesService.getRecentSeries(5);

            assertThat(result).hasSize(2);
            verify(seriesRepository).findRecentSeries(5);
        }
    }

    @Nested
    @DisplayName("searchSeriesByPublisherAndYear Tests")
    class SearchSeriesByPublisherAndYearTests {

        @Test
        @DisplayName("Should filter by publisher")
        void shouldFilterByPublisher() {
            Series marvel = createTestSeries(1L, "Spider-Man");
            marvel.setPublisher("Marvel");

            Series dc = createTestSeries(2L, "Batman");
            dc.setPublisher("DC");

            when(seriesRepository.findAll()).thenReturn(List.of(marvel, dc));

            List<Series> result = seriesService.searchSeriesByPublisherAndYear("Marvel", null, null);

            assertThat(result).hasSize(1);
            assertThat(result.get(0).getPublisher()).isEqualTo("Marvel");
        }

        @Test
        @DisplayName("Should filter by start year range")
        void shouldFilterByStartYearRange() {
            Series series2015 = createTestSeries(1L, "Spider-Man");
            series2015.setStartYear(2015);

            Series series2020 = createTestSeries(2L, "X-Men");
            series2020.setStartYear(2020);

            when(seriesRepository.findAll()).thenReturn(List.of(series2015, series2020));

            List<Series> result = seriesService.searchSeriesByPublisherAndYear(null, 2018, null);

            assertThat(result).hasSize(1);
            assertThat(result.get(0).getStartYear()).isEqualTo(2020);
        }

        @Test
        @DisplayName("Should filter by end year range")
        void shouldFilterByEndYearRange() {
            Series series2015 = createTestSeries(1L, "Spider-Man");
            series2015.setStartYear(2015);

            Series series2020 = createTestSeries(2L, "X-Men");
            series2020.setStartYear(2020);

            when(seriesRepository.findAll()).thenReturn(List.of(series2015, series2020));

            List<Series> result = seriesService.searchSeriesByPublisherAndYear(null, null, 2017);

            assertThat(result).hasSize(1);
            assertThat(result.get(0).getStartYear()).isEqualTo(2015);
        }

        @Test
        @DisplayName("Should combine all filters")
        void shouldCombineAllFilters() {
            Series marvel2015 = createTestSeries(1L, "Spider-Man");
            marvel2015.setPublisher("Marvel");
            marvel2015.setStartYear(2015);

            Series marvel2020 = createTestSeries(2L, "X-Men");
            marvel2020.setPublisher("Marvel");
            marvel2020.setStartYear(2020);

            Series dc2015 = createTestSeries(3L, "Batman");
            dc2015.setPublisher("DC");
            dc2015.setStartYear(2015);

            when(seriesRepository.findAll()).thenReturn(List.of(marvel2015, marvel2020, dc2015));

            List<Series> result = seriesService.searchSeriesByPublisherAndYear("Marvel", 2010, 2018);

            assertThat(result).hasSize(1);
            assertThat(result.get(0).getName()).isEqualTo("Spider-Man");
        }
    }

    @Nested
    @DisplayName("createSeriesFromComicVine Tests")
    class CreateSeriesFromComicVineTests {

        @Test
        @DisplayName("Should create series from Comic Vine data")
        void shouldCreateSeriesFromComicVine() {
            ComicVineService.ComicVineSeriesDto cvDto = createComicVineSeriesDto("12345", "Spider-Man");

            when(seriesRepository.save(any(Series.class))).thenAnswer(invocation -> {
                Series saved = invocation.getArgument(0);
                saved.setId(1L);
                return saved;
            });
            setupCacheMocks();

            Series result = seriesService.createSeriesFromComicVine("12345", cvDto);

            assertThat(result).isNotNull();
            assertThat(result.getName()).isEqualTo("Spider-Man");
            assertThat(result.getComicVineId()).isEqualTo("12345");
        }

        @Test
        @DisplayName("Should generate description when Comic Vine description is empty")
        void shouldGenerateDescriptionWhenEmpty() {
            ComicVineService.ComicVineSeriesDto cvDto = createComicVineSeriesDto("12345", "Spider-Man");
            cvDto.setDescription(null);

            DescriptionGenerated generated = new DescriptionGenerated();
            generated.setDescription("Generated description");
            generated.setGenerated(true);

            when(descriptionGeneratorService.generateDescription(anyString(), anyString(), anyString(), any(), any()))
                    .thenReturn(generated);
            when(seriesRepository.save(any(Series.class))).thenAnswer(invocation -> {
                Series saved = invocation.getArgument(0);
                saved.setId(1L);
                return saved;
            });
            setupCacheMocks();

            Series result = seriesService.createSeriesFromComicVine("12345", cvDto);

            assertThat(result.getGeneratedDescription()).isTrue();
        }
    }

    @Nested
    @DisplayName("createMultipleSeriesFromComicVine Tests")
    class CreateMultipleSeriesFromComicVineTests {

        @Test
        @DisplayName("Should batch create series from Comic Vine")
        void shouldBatchCreateSeries() {
            List<ComicVineService.ComicVineSeriesDto> cvDtos = List.of(
                    createComicVineSeriesDto("12345", "Spider-Man"),
                    createComicVineSeriesDto("67890", "X-Men")
            );

            when(seriesRepository.save(any(Series.class))).thenAnswer(invocation -> {
                Series saved = invocation.getArgument(0);
                saved.setId((long) (Math.random() * 1000));
                return saved;
            });
            setupCacheMocks();

            List<Series> result = seriesService.createMultipleSeriesFromComicVine(cvDtos);

            assertThat(result).hasSize(2);
            verify(seriesRepository, times(2)).save(any(Series.class));
        }
    }

    @Nested
    @DisplayName("getPopularSeries Tests")
    class GetPopularSeriesTests {

        @Test
        @DisplayName("Should return series sorted by issue count")
        void shouldReturnSeriesSortedByIssueCount() {
            Series seriesWithMany = createTestSeries(1L, "Spider-Man");
            seriesWithMany.setIssues(List.of(
                    createTestIssue(1L, "1", seriesWithMany),
                    createTestIssue(2L, "2", seriesWithMany),
                    createTestIssue(3L, "3", seriesWithMany)
            ));

            Series seriesWithFew = createTestSeries(2L, "X-Men");
            seriesWithFew.setIssues(List.of(
                    createTestIssue(4L, "1", seriesWithFew)
            ));

            when(seriesRepository.findAll()).thenReturn(List.of(seriesWithFew, seriesWithMany));

            List<Series> result = seriesService.getPopularSeries(10);

            assertThat(result).hasSize(2);
            assertThat(result.get(0).getName()).isEqualTo("Spider-Man");
            assertThat(result.get(1).getName()).isEqualTo("X-Men");
        }

        @Test
        @DisplayName("Should respect limit parameter")
        void shouldRespectLimit() {
            List<Series> allSeries = new ArrayList<>();
            for (int i = 0; i < 10; i++) {
                allSeries.add(createTestSeries((long) i, "Series " + i));
            }

            when(seriesRepository.findAll()).thenReturn(allSeries);

            List<Series> result = seriesService.getPopularSeries(5);

            assertThat(result).hasSize(5);
        }
    }

    @Nested
    @DisplayName("Cache Management Tests")
    class CacheManagementTests {

        @Test
        @DisplayName("Should clear all series caches")
        void shouldClearAllSeriesCaches() {
            when(cacheManager.getCache(anyString())).thenReturn(cache);

            seriesService.clearAllSeriesCaches();

            verify(cache, atLeast(8)).clear();
        }

        @Test
        @DisplayName("Should refresh Comic Vine cache")
        void shouldRefreshComicVineCache() {
            seriesService.refreshComicVineCache();

            // Method has @CacheEvict annotation, so no additional verification needed
            // The annotation handles the cache eviction
        }
    }

    @Nested
    @DisplayName("getComicVineSeriesById Tests")
    class GetComicVineSeriesByIdTests {

        @Test
        @DisplayName("Should return Comic Vine series by ID")
        void shouldReturnComicVineSeriesById() {
            ComicVineService.ComicVineSeriesDto dto = createComicVineSeriesDto("12345", "Spider-Man");

            when(comicVineService.getComicVineSeriesById(12345L)).thenReturn(dto);

            ComicVineService.ComicVineSeriesDto result = seriesService.getComicVineSeriesById(12345L);

            assertThat(result).isNotNull();
            assertThat(result.getName()).isEqualTo("Spider-Man");
        }
    }

    // Helper method to setup cache mocks
    private void setupCacheMocks() {
        when(cacheManager.getCache(anyString())).thenReturn(cache);
    }

    // Test implementation classes
    static class TestSeriesCreateRequest implements SeriesController.SeriesCreateRequestDto {
        private String name;
        private String description;
        private String publisher;
        private Integer startYear;
        private Integer endYear;
        private String imageUrl;
        private String comicVineId;
        private List<String> comicVineIds;
        private Integer issuesAvailableCount;

        @Override
        public String getName() { return name; }
        @Override
        public String getDescription() { return description; }
        @Override
        public String getPublisher() { return publisher; }
        @Override
        public Integer getStartYear() { return startYear; }
        @Override
        public Integer getEndYear() { return endYear; }
        @Override
        public String getImageUrl() { return imageUrl; }
        @Override
        public String getComicVineId() { return comicVineId; }
        @Override
        public List<String> getComicVineIds() { return comicVineIds; }
        @Override
        public Integer getIssuesAvailableCount() { return issuesAvailableCount; }

        public void setName(String name) { this.name = name; }
        public void setDescription(String description) { this.description = description; }
        public void setPublisher(String publisher) { this.publisher = publisher; }
        public void setStartYear(Integer startYear) { this.startYear = startYear; }
        public void setComicVineIds(List<String> comicVineIds) { this.comicVineIds = comicVineIds; }
    }

    static class TestSeriesUpdateRequest implements SeriesService.SeriesUpdateRequest {
        private String name;
        private String description;
        private String publisher;
        private Integer startYear;
        private Integer endYear;
        private String imageUrl;
        private String comicVineId;

        @Override
        public String getName() { return name; }
        @Override
        public String getDescription() { return description; }
        @Override
        public String getPublisher() { return publisher; }
        @Override
        public Integer getStartYear() { return startYear; }
        @Override
        public Integer getEndYear() { return endYear; }
        @Override
        public String getImageUrl() { return imageUrl; }
        @Override
        public String getComicVineId() { return comicVineId; }

        public void setName(String name) { this.name = name; }
        public void setDescription(String description) { this.description = description; }
        public void setPublisher(String publisher) { this.publisher = publisher; }
    }

    static class TestSeriesUpdateRequestDto extends TestSeriesUpdateRequest
            implements SeriesController.SeriesUpdateRequestDto {
        private List<String> comicVineIds;

        @Override
        public List<String> getComicVineIds() { return comicVineIds; }

        public void setComicVineIds(List<String> comicVineIds) { this.comicVineIds = comicVineIds; }
    }
}