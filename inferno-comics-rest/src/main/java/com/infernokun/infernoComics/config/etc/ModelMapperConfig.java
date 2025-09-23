package com.infernokun.infernoComics.config.etc;

import com.infernokun.infernoComics.controllers.SeriesController;
import com.infernokun.infernoComics.models.Series;
import com.infernokun.infernoComics.services.SeriesService;
import org.modelmapper.ModelMapper;
import org.modelmapper.convention.MatchingStrategies;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ModelMapperConfig {

    @Bean
    public ModelMapper modelMapper() {
        ModelMapper mapper = new ModelMapper();

        mapper.getConfiguration().setMatchingStrategy(MatchingStrategies.STRICT);

        mapper.createTypeMap(SeriesController.SeriesCreateRequestDto.class, Series.class)
                .addMappings(mapping -> {
                    mapping.skip(Series::setId);
                    mapping.skip(Series::setCreatedAt);
                    mapping.skip(Series::setUpdatedAt);
                    mapping.skip(Series::setIssues);
                    mapping.skip(Series::setCachedCoverUrls);
                    mapping.skip(Series::setLastCachedCovers);
                    mapping.skip(Series::setGcdIds);
                    mapping.skip(Series::setGeneratedDescription);
                });

        mapper.createTypeMap(SeriesService.SeriesUpdateRequest.class, Series.class)
                .addMappings(mapping -> {
                    mapping.skip(Series::setId);                    // CRITICAL: Never map ID
                    mapping.skip(Series::setCreatedAt);
                    mapping.skip(Series::setUpdatedAt);
                    mapping.skip(Series::setIssues);
                    mapping.skip(Series::setCachedCoverUrls);
                    mapping.skip(Series::setLastCachedCovers);
                    mapping.skip(Series::setGcdIds);
                    mapping.skip(Series::setGeneratedDescription);
                });

        mapper.createTypeMap(SeriesController.SeriesUpdateRequestDto.class, Series.class)
                .addMappings(mapping -> {
                    mapping.skip(Series::setId);                    // CRITICAL: Never map ID
                    mapping.skip(Series::setCreatedAt);
                    mapping.skip(Series::setUpdatedAt);
                    mapping.skip(Series::setIssues);
                    mapping.skip(Series::setCachedCoverUrls);
                    mapping.skip(Series::setLastCachedCovers);
                    mapping.skip(Series::setGcdIds);
                    mapping.skip(Series::setGeneratedDescription);
                });

        return mapper;
    }
}