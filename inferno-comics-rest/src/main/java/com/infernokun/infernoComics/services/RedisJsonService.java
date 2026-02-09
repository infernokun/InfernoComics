package com.infernokun.infernoComics.services;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.TimeUnit;

/**
 * Service for manual Redis JSON datatype operations (JSON.SET/JSON.GET/JSON.DEL).
 * Use this for operations outside of Spring Cache annotations.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RedisJsonService {

    private static final byte[] JSON_ROOT_PATH = "$".getBytes(StandardCharsets.UTF_8);

    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper;

    /**
     * Store a value as a Redis JSON document at the root path.
     */
    public void jsonSet(String key, Object value) {
        try {
            String json = (value instanceof String) ? (String) value
                    : objectMapper.writeValueAsString(value);

            stringRedisTemplate.execute((RedisCallback<Void>) connection -> {
                connection.execute("JSON.SET",
                        key.getBytes(StandardCharsets.UTF_8),
                        JSON_ROOT_PATH,
                        json.getBytes(StandardCharsets.UTF_8));
                return null;
            });
        } catch (Exception e) {
            log.error("Failed to JSON.SET key {}: {}", key, e.getMessage());
        }
    }

    /**
     * Store a value as a Redis JSON document with a TTL.
     */
    public void jsonSet(String key, Object value, Duration ttl) {
        jsonSet(key, value);
        if (ttl != null && !ttl.isZero() && !ttl.isNegative()) {
            stringRedisTemplate.expire(key, ttl.toSeconds(), TimeUnit.SECONDS);
        }
    }

    /**
     * Retrieve a raw JSON string from a Redis JSON document.
     */
    public String jsonGet(String key) {
        try {
            return stringRedisTemplate.execute((RedisCallback<String>) connection -> {
                byte[] result = (byte[]) connection.execute("JSON.GET",
                        key.getBytes(StandardCharsets.UTF_8),
                        JSON_ROOT_PATH);
                if (result == null) return null;
                return unwrapJsonArray(new String(result, StandardCharsets.UTF_8));
            });
        } catch (Exception e) {
            log.error("Failed to JSON.GET key {}: {}", key, e.getMessage());
            return null;
        }
    }

    /**
     * Retrieve and deserialize a Redis JSON document to the given class.
     */
    public <T> T jsonGet(String key, Class<T> clazz) {
        String json = jsonGet(key);
        if (json == null) return null;
        try {
            return objectMapper.readValue(json, clazz);
        } catch (Exception e) {
            log.error("Failed to deserialize key {} to {}: {}", key, clazz.getSimpleName(), e.getMessage());
            return null;
        }
    }

    /**
     * Retrieve and deserialize a Redis JSON document using a TypeReference (for generic types).
     */
    public <T> T jsonGet(String key, TypeReference<T> typeRef) {
        String json = jsonGet(key);
        if (json == null) return null;
        try {
            return objectMapper.readValue(json, typeRef);
        } catch (Exception e) {
            log.error("Failed to deserialize key {} to {}: {}", key, typeRef.getType(), e.getMessage());
            return null;
        }
    }

    /**
     * Delete a Redis JSON document.
     */
    public void jsonDel(String key) {
        try {
            stringRedisTemplate.execute((RedisCallback<Void>) connection -> {
                connection.execute("JSON.DEL",
                        key.getBytes(StandardCharsets.UTF_8),
                        JSON_ROOT_PATH);
                return null;
            });
        } catch (Exception e) {
            log.error("Failed to JSON.DEL key {}: {}", key, e.getMessage());
        }
    }

    /**
     * JSON.GET with $ path returns a JSON array wrapper, e.g. ["value"].
     * Strip the outer array brackets to get the actual value.
     */
    private String unwrapJsonArray(String raw) {
        if (raw != null && raw.startsWith("[") && raw.endsWith("]")) {
            return raw.substring(1, raw.length() - 1);
        }
        return raw;
    }
}
