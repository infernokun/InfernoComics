package com.infernokun.infernoComics.services.issue;

import com.infernokun.infernoComics.config.InfernoComicsConfig;
import com.infernokun.infernoComics.repositories.IssueRepository;
import com.infernokun.infernoComics.repositories.SeriesRepository;
import com.infernokun.infernoComics.services.ComicVineService;
import com.infernokun.infernoComics.services.DescriptionGeneratorService;
import com.infernokun.infernoComics.services.RecognitionService;
import com.infernokun.infernoComics.services.gcd.GCDatabaseService;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cache.CacheManager;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class IssueServiceTest {

    @MockitoBean
    private IssueRepository issueRepository;

    @MockitoBean
    private SeriesRepository seriesRepository;

    @MockitoBean
    private ComicVineService comicVineService;

    @MockitoBean
    private InfernoComicsConfig infernoComicsConfig;

    @MockitoBean
    private DescriptionGeneratorService descriptionGeneratorService;

    @MockitoBean
    private GCDatabaseService gcDatabaseService;

    @MockitoBean
    private CacheManager cacheManager;

    @MockitoBean
    private RecognitionService recognitionService;


    @Test
    void contextLoads() {
        assertThat(true).isTrue();
    }
}