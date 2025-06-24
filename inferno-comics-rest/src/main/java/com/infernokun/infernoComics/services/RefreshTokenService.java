package com.infernokun.amaterasu.services.entity;

import com.infernokun.amaterasu.exceptions.TokenException;
import com.infernokun.amaterasu.models.entities.RefreshToken;
import com.infernokun.amaterasu.models.entities.User;
import com.infernokun.amaterasu.repositories.RefreshTokenRepository;
import com.infernokun.amaterasu.repositories.UserRepository;
import com.infernokun.amaterasu.services.BaseService;
import jakarta.annotation.PostConstruct;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class RefreshTokenService extends BaseService {
    private final RefreshTokenRepository refreshTokenRepository;
    private final UserRepository userRepository;
    private final UserService userService;
    private final JwtEncoder jwtEncoder;

    // Cache name
    private static final String TOKEN_CACHE = "tokenCache";

    /**
     * Creates a refresh token (opaque UUID) stored in database
     */
    public RefreshToken createRefreshToken(User user, String deviceInfo, HttpServletRequest request) {
        // Clean up expired tokens first
        cleanupExpiredTokensForUser(user.getId());

        RefreshToken refreshToken = RefreshToken.builder()
                .token(UUID.randomUUID().toString()) // Opaque UUID, not JWT
                .user(user)
                .sessionId(UUID.randomUUID().toString())
                .deviceInfo(deviceInfo)
                .creationDate(Instant.now())
                .expirationDate(Instant.now().plus(90, ChronoUnit.DAYS)) // Long-lived
                .lastUsed(Instant.now())
                .ipAddress(getClientIP(request))
                .userAgent(request.getHeader("User-Agent"))
                .deviceFingerprint(generateDeviceFingerprint(request))
                .revoked(false)
                .build();

        return refreshTokenRepository.save(refreshToken);
    }

    /**
     * Generates short-lived JWT access token (NOT stored in database)
     */
    public String generateAccessToken(User user) {
        Instant now = Instant.now();
        Instant expiration = now.plus(30, ChronoUnit.MINUTES); // Short-lived

        String scope = user.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.joining(" "));

        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("self")
                .issuedAt(now)
                .expiresAt(expiration)
                .subject(user.getId())
                .claim("username", user.getUsername())
                .claim("roles", scope)
                .build();

        return jwtEncoder.encode(JwtEncoderParameters.from(claims)).getTokenValue();
    }

    /**
     * Validates refresh token and generates new access token
     */
    public String refreshAccessToken(String refreshTokenString, HttpServletRequest request) {
        RefreshToken refreshToken = refreshTokenRepository.findByToken(refreshTokenString)
                .orElseThrow(() -> new TokenException("Invalid refresh token"));

        // Check if token is revoked or expired
        if (refreshToken.isRevoked() || refreshToken.isExpired()) {
            if (!refreshToken.isRevoked()) {
                refreshToken.revoke("Token expired");
                refreshTokenRepository.save(refreshToken);
            }
            throw new TokenException("Refresh token expired or revoked");
        }

        // Security check - validate device/IP if needed
        validateRefreshRequest(refreshToken, request);

        // Update last used timestamp (extends sliding expiration)
        refreshToken.updateLastUsed();
        refreshToken = refreshTokenRepository.save(refreshToken);

        // Generate new access token
        return generateAccessToken(refreshToken.getUser());
    }

    /**
     * Security validation for refresh requests
     */
    private void validateRefreshRequest(RefreshToken token, HttpServletRequest request) {
        String currentIP = getClientIP(request);
        String currentUserAgent = request.getHeader("User-Agent");

        // Log suspicious activity (optional - you can make this stricter)
        if (!token.getIpAddress().equals(currentIP)) {
            LOGGER.warn("IP address changed for refresh token. User: {}, Old: {}, New: {}",
                    token.getUser().getId(), token.getIpAddress(), currentIP);
        }

        if (!token.getUserAgent().equals(currentUserAgent)) {
            LOGGER.warn("User agent changed for refresh token. User: {}", token.getUser().getId());
        }
    }

    /**
     * Rotate refresh token if needed (every 30 days)
     */
    public RefreshToken rotateRefreshTokenIfNeeded(RefreshToken currentToken, HttpServletRequest request) {
        if (currentToken.needsRotation()) {
            // Ensure proper revocation
            if (!currentToken.isRevoked()) {
                currentToken.revoke("Token rotated for security");
                refreshTokenRepository.save(currentToken);
            }

            return createRefreshToken(currentToken.getUser(), currentToken.getDeviceInfo(), request);
        }
        return currentToken;
    }

    /**
     * Get all active sessions for a user
     */
    public List<RefreshToken> getActiveSessionsForUser(String userId) {
        return refreshTokenRepository.findAllByUserId(userId).stream()
                .filter(token -> !token.isRevoked() && !token.isExpired())
                .collect(Collectors.toList());
    }

    /**
     * Revoke specific session
     */
    @Transactional
    public void revokeSession(String refreshTokenString, String reason) {
        if (reason == null || reason.trim().isEmpty()) {
            throw new IllegalArgumentException("Revocation reason cannot be null or empty");
        }

        RefreshToken refreshToken = refreshTokenRepository.findByToken(refreshTokenString)
                .orElseThrow(() -> new TokenException("Refresh token not found"));

        refreshToken.revoke(reason);
        refreshTokenRepository.save(refreshToken);
        evictTokenCache(refreshTokenString);
    }

    /**
     * Revoke all sessions for a user
     */
    @Transactional
    public void revokeAllUserSessions(String userId, String reason) {
        List<RefreshToken> userTokens = refreshTokenRepository.findAllByUserId(userId);

        for (RefreshToken token : userTokens) {
            if (!token.isRevoked()) {
                token.revoke(reason);
                evictTokenCache(token.getToken());
            }
        }

        refreshTokenRepository.saveAll(userTokens);
    }

    private void cleanupExpiredTokensForUser(String userId) {
        List<RefreshToken> userTokens = refreshTokenRepository.findAllByUserId(userId);
        List<RefreshToken> tokensToUpdate = userTokens.stream()
                .filter(token -> token.isExpired() && !token.isRevoked())
                .collect(Collectors.toList());

        for (RefreshToken token : tokensToUpdate) {
            token.revoke("Expired during cleanup");
        }

        if (!tokensToUpdate.isEmpty()) {
            refreshTokenRepository.saveAll(tokensToUpdate);
        }
    }

    // Utility methods
    private String getClientIP(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }

        String xRealIP = request.getHeader("X-Real-IP");
        if (xRealIP != null && !xRealIP.isEmpty()) {
            return xRealIP;
        }

        return request.getRemoteAddr();
    }

    private String generateDeviceFingerprint(HttpServletRequest request) {
        // Simple device fingerprint - you can make this more sophisticated
        String userAgent = request.getHeader("User-Agent");
        String acceptLanguage = request.getHeader("Accept-Language");
        return UUID.nameUUIDFromBytes((userAgent + acceptLanguage).getBytes()).toString();
    }

    public RefreshToken findByToken(String token) {
        return refreshTokenRepository.findByToken(token)
                .orElseThrow(() -> new TokenException("Refresh token not found"));
    }

    @CacheEvict(value = TOKEN_CACHE, key = "#token")
    public void evictTokenCache(String token) {
        // Cache eviction handled by annotation
    }
}