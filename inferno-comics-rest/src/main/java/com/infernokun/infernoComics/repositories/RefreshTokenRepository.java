package com.infernokun.infernoComics.repositories;

import com.infernokun.infernoComics.models.RefreshToken;
import jakarta.transaction.Transactional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {
    Optional<RefreshToken> findByToken(String token);
    Optional<RefreshToken> findByUserId(String id);
    Optional<RefreshToken> deleteByUserId(String id);
    Optional<RefreshToken> findByUserIdAndSessionId(String userId, String sessionId);
    List<RefreshToken> findAllByUserId(String userId);
    void deleteByExpirationDateBefore(Instant date);
    void deleteByUserIdAndSessionId(String userId, String sessionId);

    @Modifying
    @Transactional
    void deleteByToken(String token);
}
