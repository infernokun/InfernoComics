package com.infernokun.infernoComics.config;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.annotation.PropertyAccessor;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.Jackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import org.springframework.data.redis.serializer.StringRedisSerializer;
import lombok.extern.slf4j.Slf4j;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@Configuration
@EnableCaching
public class RedisConfig {

    @Bean
    @Primary
    public ObjectMapper objectMapper() {
        ObjectMapper mapper = new ObjectMapper();

        // Basic configuration without Hibernate modules for now
        mapper.registerModule(new JavaTimeModule());
        mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        mapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        mapper.configure(SerializationFeature.FAIL_ON_EMPTY_BEANS, false);

        // Enable default typing to preserve class information
        mapper.activateDefaultTyping(
                mapper.getPolymorphicTypeValidator(),
                ObjectMapper.DefaultTyping.NON_FINAL,
                JsonTypeInfo.As.PROPERTY
        );

        return mapper;
    }

    @Bean
    public RedisCacheManager cacheManager(RedisConnectionFactory redisConnectionFactory, ObjectMapper objectMapper) {
        ObjectMapper redisMapper = new ObjectMapper();
        redisMapper.registerModule(new JavaTimeModule());
        redisMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        redisMapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        redisMapper.configure(SerializationFeature.FAIL_ON_EMPTY_BEANS, false);

        // This ensures proper type information is preserved in Redis
        redisMapper.activateDefaultTyping(
                redisMapper.getPolymorphicTypeValidator(),
                ObjectMapper.DefaultTyping.NON_FINAL,
                JsonTypeInfo.As.PROPERTY
        );

        GenericJackson2JsonRedisSerializer jsonRedisSerializer =
                new GenericJackson2JsonRedisSerializer(redisMapper);

        RedisCacheConfiguration defaultConfig = RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(Duration.ofHours(1))
                .serializeKeysWith(RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer()))
                .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(jsonRedisSerializer))
                .disableCachingNullValues();

        // Custom configurations for specific caches
        Map<String, RedisCacheConfiguration> cacheConfigurations = new HashMap<>();

        // Comic descriptions cache - longer TTL since descriptions don't change often
        cacheConfigurations.put("comic-descriptions", defaultConfig
                .entryTtl(Duration.ofDays(7))
                .prefixCacheNameWith("comics:descriptions:"));

        // Comic metadata cache - shorter TTL for frequently changing data
        cacheConfigurations.put("comic-metadata", defaultConfig
                .entryTtl(Duration.ofHours(4))
                .prefixCacheNameWith("comics:metadata:"));

        // Series information cache
        cacheConfigurations.put("series-info", defaultConfig
                .entryTtl(Duration.ofDays(1))
                .prefixCacheNameWith("comics:series:"));

        // User-specific caches with shorter TTL
        cacheConfigurations.put("user-collections", defaultConfig
                .entryTtl(Duration.ofMinutes(30))
                .prefixCacheNameWith("users:collections:"));

        return RedisCacheManager.builder(redisConnectionFactory)
                .cacheDefaults(defaultConfig)
                .withInitialCacheConfigurations(cacheConfigurations)
                .transactionAware()
                .build();
    }

    @Bean
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory connectionFactory) {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(connectionFactory);

        ObjectMapper om = new ObjectMapper();
        om.setVisibility(PropertyAccessor.ALL, JsonAutoDetect.Visibility.ANY);
        om.activateDefaultTyping(om.getPolymorphicTypeValidator(),
                ObjectMapper.DefaultTyping.NON_FINAL);
        om.registerModule(new JavaTimeModule());
        om.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

        // Configure to ignore unknown properties and empty beans
        om.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        om.configure(SerializationFeature.FAIL_ON_EMPTY_BEANS, false);

        Jackson2JsonRedisSerializer<Object> jackson2JsonRedisSerializer =
                new Jackson2JsonRedisSerializer<>(om, Object.class);

        template.setDefaultSerializer(jackson2JsonRedisSerializer);
        template.setKeySerializer(new StringRedisSerializer());

        return template;
    }
}