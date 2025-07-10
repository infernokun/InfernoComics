package com.infernokun.infernoComics.repositories.gcd;

import com.infernokun.infernoComics.models.gcd.GCDSeries;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface GCDSeriesRepository extends JpaRepository<GCDSeries, Long> {
    List<GCDSeries> findByNameContainingIgnoreCase(String name);
    List<GCDSeries> findByYearBegan(Integer year);
    List<GCDSeries> findByYearBeganAndNameContainingIgnoreCase(Integer year, String name);
}