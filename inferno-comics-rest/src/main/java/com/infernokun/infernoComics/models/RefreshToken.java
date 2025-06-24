package com.infernokun.infernoComics.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

@Data
@Entity
@Builder
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
public class RefreshToken {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(length = 1000, nullable = false, unique = true)
    private String token;

    private Instant creationDate;
    private Instant expirationDate;

    @Column(name = "last_used")
    private Instant lastUsed;

    @ManyToOne
    @JoinColumn(name = "user_id", referencedColumnName = "id")
    private User user;

    @Column(name = "session_id")
    private String sessionId;

    @Column(name = "device_info")
    private String deviceInfo;

    // ADD: Security tracking fields
    @Column(name = "ip_address")
    private String ipAddress;

    @Column(name = "user_agent", length = 2000)
    private String userAgent;

    @Column(name = "device_fingerprint")
    private String deviceFingerprint;

    // ADD: Token lifecycle management
    @Column(name = "revoked")
    @Builder.Default
    private Boolean revoked = false;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Column(name = "revoked_reason")
    private String revokedReason;

    public boolean isExpired() {
        if (revoked) return true;

        // Check sliding expiration (90 days of inactivity)
        Instant inactivityThreshold = (lastUsed != null ? lastUsed : creationDate)
                .plus(90, ChronoUnit.DAYS);

        return Instant.now().isAfter(inactivityThreshold);
    }

    public void updateLastUsed() {
        this.lastUsed = Instant.now();
    }

    public void revoke(String reason) {
        this.revoked = true;
        this.revokedAt = Instant.now();
        this.revokedReason = reason;
    }

    public boolean isRevoked() {
        return this.revoked;
    }

    public boolean needsRotation() {
        return creationDate.plus(30, ChronoUnit.DAYS).isBefore(Instant.now());
    }
}
