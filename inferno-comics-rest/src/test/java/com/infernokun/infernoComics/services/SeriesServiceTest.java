package com.infernokun.infernoComics.services;

import com.infernokun.infernoComics.clients.WebClient;
import com.infernokun.infernoComics.config.InfernoComicsConfig;
import com.infernokun.infernoComics.repositories.IssueRepository;
import com.infernokun.infernoComics.repositories.MissingIssueRepository;
import com.infernokun.infernoComics.repositories.SeriesRepository;
import com.infernokun.infernoComics.repositories.sync.ProcessedFileRepository;
import com.infernokun.infernoComics.services.gcd.GCDatabaseService;
import com.infernokun.infernoComics.services.sync.WeirdService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.modelmapper.ModelMapper;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;

@ExtendWith(MockitoExtension.class)
class SeriesServiceTest {

    @Mock
    private IssueRepository issueRepository;

    @Mock
    private SeriesRepository seriesRepository;

    @Mock
    private ComicVineService comicVineService;

    @Mock
    private InfernoComicsConfig infernoComicsConfig;

    @Mock
    private WebClient webClient;

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
    private SeriesService seriesService;

    @Mock
    private WeirdService weirdService;

    @Mock
    private ProgressDataService progressDataService;

    @Mock
    private ProcessedFileRepository processedFileRepository;

    @Mock
    private MissingIssueRepository missingIssueRepository;

    @Mock
    private ModelMapper modelMapper;

    @BeforeEach
    void setUp() {
        seriesService = new SeriesService(
                webClient,
                weirdService,
                progressDataService,
                comicVineService,
                gcDatabaseService,
                descriptionGeneratorService,
                issueRepository,
                seriesRepository,
                missingIssueRepository,
                processedFileRepository,
                modelMapper,
                cacheManager
        );
    }
}