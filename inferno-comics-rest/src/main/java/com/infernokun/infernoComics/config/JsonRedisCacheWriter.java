package com.infernokun.infernoComics.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.cache.CacheStatistics;
import org.springframework.data.redis.cache.CacheStatisticsCollector;
import org.springframework.data.redis.cache.RedisCacheWriter;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.lang.NonNull;
import org.springframework.lang.Nullable;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

/**
 * Custom RedisCacheWriter that stores values using Redis JSON datatype
 * (JSON.SET/JSON.GET) instead of the default STRING datatype (SET/GET).
 */
@Slf4j
public class JsonRedisCacheWriter implements RedisCacheWriter {

    private static final byte[] JSON_ROOT_PATH = "$".getBytes(StandardCharsets.UTF_8);
    private static final byte[] NX = "NX".getBytes(StandardCharsets.UTF_8);

    private final RedisConnectionFactory connectionFactory;
    private CacheStatisticsCollector statisticsCollector = CacheStatisticsCollector.none();

    public JsonRedisCacheWriter(RedisConnectionFactory connectionFactory) {
        this.connectionFactory = connectionFactory;
    }

    @Override
    public void put(@NonNull String name, @NonNull byte[] key, @NonNull byte[] value, @Nullable Duration ttl) {
        try (RedisConnection connection = connectionFactory.getConnection()) {
            connection.execute("JSON.SET", key, JSON_ROOT_PATH, value);

            if (ttl != null && !ttl.isZero() && !ttl.isNegative()) {
                connection.keyCommands().expire(key, ttl.getSeconds());
            }
        } catch (Exception e) {
            log.error("Cache [{}] JSON.SET failed for key {}: {}", name, new String(key, StandardCharsets.UTF_8), e.getMessage());
            throw e;
        }
    }

    @Override
    public byte[] get(@NonNull String name, @NonNull byte[] key) {
        try (RedisConnection connection = connectionFactory.getConnection()) {
            byte[] result = (byte[]) connection.execute("JSON.GET", key, JSON_ROOT_PATH);

            if (result == null) {
                return null;
            }

            return unwrapJsonArray(result);
        } catch (Exception e) {
            log.error("Cache [{}] JSON.GET failed for key {}: {}", name, new String(key, StandardCharsets.UTF_8), e.getMessage());
            return null;
        }
    }

    @Override
    public byte[] putIfAbsent(@NonNull String name, @NonNull byte[] key, @NonNull byte[] value, @Nullable Duration ttl) {
        try (RedisConnection connection = connectionFactory.getConnection()) {
            Object result = connection.execute("JSON.SET", key, JSON_ROOT_PATH, value, NX);

            if (result != null) {
                // Key was set successfully (didn't exist before)
                if (ttl != null && !ttl.isZero() && !ttl.isNegative()) {
                    connection.keyCommands().expire(key, ttl.getSeconds());
                }
                return null;
            }

            // Key already existed, return the existing value
            return get(name, key);
        } catch (Exception e) {
            log.error("Cache [{}] JSON.SET NX failed for key {}: {}", name, new String(key, StandardCharsets.UTF_8), e.getMessage());
            throw e;
        }
    }

    @Override
    public void remove(@NonNull String name, @NonNull byte[] key) {
        try (RedisConnection connection = connectionFactory.getConnection()) {
            connection.keyCommands().del(key);
        }
    }

    @Override
    public void clean(@NonNull String name, @NonNull byte[] pattern) {
        try (RedisConnection connection = connectionFactory.getConnection()) {
            Set<byte[]> keys = connection.keyCommands().keys(pattern);
            if (keys != null && !keys.isEmpty()) {
                connection.keyCommands().del(keys.toArray(new byte[0][]));
            }
        }
    }

    @NonNull
    @Override
    public CompletableFuture<byte[]> retrieve(@NonNull String name, @NonNull byte[] key, @Nullable Duration ttl) {
        return CompletableFuture.supplyAsync(() -> get(name, key));
    }

    @NonNull
    @Override
    public CompletableFuture<Void> store(@NonNull String name, @NonNull byte[] key, @NonNull byte[] value, @Nullable Duration ttl) {
        return CompletableFuture.runAsync(() -> put(name, key, value, ttl));
    }

    @Override
    public void clearStatistics(@NonNull String name) {
        statisticsCollector.reset(name);
    }

    @NonNull
    @Override
    public RedisCacheWriter withStatisticsCollector(@NonNull CacheStatisticsCollector cacheStatisticsCollector) {
        this.statisticsCollector = cacheStatisticsCollector;
        return this;
    }

    @NonNull
    @Override
    public CacheStatistics getCacheStatistics(@NonNull String cacheName) {
        return statisticsCollector.getCacheStatistics(cacheName);
    }

    /**
     * JSON.GET with $ path returns a JSON array wrapper, e.g. [{"key":"value"}].
     * Unwrap the outer array to get the actual stored value bytes.
     */
    private byte[] unwrapJsonArray(byte[] result) {
        if (result.length >= 2 && result[0] == '[' && result[result.length - 1] == ']') {
            byte[] unwrapped = new byte[result.length - 2];
            System.arraycopy(result, 1, unwrapped, 0, unwrapped.length);
            return unwrapped;
        }
        return result;
    }
}
