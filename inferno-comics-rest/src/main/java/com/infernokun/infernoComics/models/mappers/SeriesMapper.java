package com.infernokun.infernoComics.models.mappers;

import com.infernokun.infernoComics.models.Series;
import com.infernokun.infernoComics.models.dto.SeriesRequest;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.factory.Mappers;

@Mapper
public interface SeriesMapper {
    SeriesMapper INSTANCE = Mappers.getMapper(SeriesMapper.class);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    @Mapping(target = "cachedCoverUrls", ignore = true)
    @Mapping(target = "lastCachedCovers", ignore = true)
    @Mapping(target = "issues", ignore = true)
    @Mapping(target = "issuesAvailableCount", ignore = true)
    @Mapping(target = "issuesOwnedCount", ignore = true)
    @Mapping(target = "lastReverification", ignore = true)
    @Mapping(target = "generatedDescription", ignore = true)
    @Mapping(target = "comicVineIds", source = "comicVineIds")
    @Mapping(target = "comicVineId", source = "comicVineId")
    @Mapping(target = "gcdIds", ignore = true)
    Series seriesRequestToSeries(SeriesRequest request);
}