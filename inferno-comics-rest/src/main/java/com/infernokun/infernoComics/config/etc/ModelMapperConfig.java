package com.infernokun.infernoComics.config.etc;

import com.infernokun.infernoComics.controllers.SeriesController;
import com.infernokun.infernoComics.models.Series;
import org.modelmapper.ModelMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ModelMapperConfig {

    @Bean
    public ModelMapper modelMapper() {
        ModelMapper mapper = new ModelMapper();

        mapper.createTypeMap(SeriesController.SeriesCreateRequestDto.class, Series.class)
                .addMappings(mapping -> {
                    mapping.skip(Series::setId);
                    mapping.skip(Series::setCreatedAt);
                    mapping.skip(Series::setUpdatedAt);
                    mapping.skip(Series::setIssues);
                    mapping.skip(Series::setCachedCoverUrls);
                    mapping.skip(Series::setLastCachedCovers);
                });
        return mapper;
    }
}
