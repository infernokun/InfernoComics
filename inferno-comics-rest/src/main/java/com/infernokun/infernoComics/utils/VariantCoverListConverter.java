package com.infernokun.infernoComics.utils;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.infernokun.infernoComics.models.Issue;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.ArrayList;
import java.util.List;

import static com.infernokun.infernoComics.utils.InfernoComicsUtils.objectMapper;

@Converter
public class VariantCoverListConverter implements AttributeConverter<List<Issue.VariantCover>, String> {

    @Override
    public String convertToDatabaseColumn(List<Issue.VariantCover> variantCovers) {
        if (variantCovers == null || variantCovers.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(variantCovers);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Error converting VariantCover list to JSON", e);
        }
    }

    @Override
    public List<Issue.VariantCover> convertToEntityAttribute(String jsonString) {
        if (jsonString == null || jsonString.trim().isEmpty()) {
            return new ArrayList<>();
        }
        try {
            return objectMapper.readValue(jsonString, new TypeReference<>() {
            });
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Error converting JSON to VariantCover list", e);
        }
    }
}