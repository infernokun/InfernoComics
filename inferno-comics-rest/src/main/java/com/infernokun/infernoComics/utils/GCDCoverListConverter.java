package com.infernokun.infernoComics.utils;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.infernokun.infernoComics.models.gcd.GCDCover;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.ArrayList;
import java.util.List;

import static com.infernokun.infernoComics.utils.InfernoComicsUtils.objectMapper;

@Converter
public class GCDCoverListConverter implements AttributeConverter<List<GCDCover>, String> {

    @Override
    public String convertToDatabaseColumn(List<GCDCover> gcdCovers) {
        if (gcdCovers == null || gcdCovers.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(gcdCovers);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Error converting GCDCover list to JSON", e);
        }
    }

    @Override
    public List<GCDCover> convertToEntityAttribute(String jsonString) {
        if (jsonString == null || jsonString.trim().isEmpty()) {
            return new ArrayList<>();
        }
        try {
            return objectMapper.readValue(jsonString, new TypeReference<>() {
            });
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Error converting JSON to GCDCover list", e);
        }
    }
}