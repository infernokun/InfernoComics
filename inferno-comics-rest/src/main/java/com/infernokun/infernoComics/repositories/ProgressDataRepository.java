package com.infernokun.infernoComics.repositories;

import com.infernokun.infernoComics.models.ProgressData;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ProgressDataRepository extends JpaRepository<ProgressData, Long> {
    Optional<ProgressData> findBySessionId(String sessionId);
}
