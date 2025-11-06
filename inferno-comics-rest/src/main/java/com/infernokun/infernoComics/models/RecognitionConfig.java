package com.infernokun.infernoComics.models;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.HashMap;
import java.util.Map;

@Data
public class RecognitionConfig {

    @JsonProperty("performance_level")
    private String performanceLevel;

    @JsonProperty("result_batch")
    private int resultBatch;

    private Map<String, RecognitionPreset> presets = new HashMap<>();

    @JsonProperty("similarity_threshold")
    private String similarityThreshold;
}

@Data
class RecognitionPreset {

    private Map<String, Integer> detectors = new HashMap<>();

    @JsonProperty("feature_weights")
    private Map<String, Double> featureWeights = new HashMap<>();

    @JsonProperty("image_size")
    private int imageSize;

    @JsonProperty("max_workers")
    private int maxWorkers;

    private Options options = new Options();
}

@Data
class Options {

    @JsonProperty("use_advanced_matching")
    private boolean useAdvancedMatching;

    @JsonProperty("use_comic_detection")
    private boolean useComicDetection;

    @JsonProperty("cache_only")
    private Boolean cacheOnly = Boolean.FALSE;
}