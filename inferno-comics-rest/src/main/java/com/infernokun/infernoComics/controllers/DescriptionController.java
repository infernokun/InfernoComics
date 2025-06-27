package com.infernokun.infernoComics.controllers;

import com.infernokun.infernoComics.models.ComicBook;
import com.infernokun.infernoComics.repositories.ComicBookRepository;
import com.infernokun.infernoComics.services.DescriptionGeneratorService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/descriptions")
@CrossOrigin(origins = "http://localhost:4200")
@Slf4j
@RequiredArgsConstructor
public class DescriptionController {

    private final DescriptionGeneratorService descriptionGeneratorService;
    private final ComicBookRepository comicBookRepository;

    @PostMapping("/generate/{comicBookId}")
    public ResponseEntity<Map<String, String>> generateDescriptionForComic(@PathVariable Long comicBookId) {
        try {
            Optional<ComicBook> comicOptional = comicBookRepository.findById(comicBookId);

            log.error("CHecking comic");

            if (comicOptional.isEmpty()) {
                return ResponseEntity.notFound().build();
            }

            log.error("found");
            ComicBook comic = comicOptional.get();
            String description = descriptionGeneratorService.generateDescription(
                    comic.getSeries() != null ? comic.getSeries().getName() : "Unknown Series",
                    comic.getIssueNumber(),
                    comic.getTitle(),
                    comic.getCoverDate().toString(),
                    comic.getDescription()
            );

            // Update the comic with the new description
            comic.setDescription(description);
            comicBookRepository.save(comic);

            return ResponseEntity.ok(Map.of(
                    "description", description,
                    "message", "Description generated successfully"
            ));

        } catch (Exception e) {
            log.error("Error generating description for comic {}: {}", comicBookId, e.getMessage());
            return ResponseEntity.ok(Map.of(
                    "description", "",
                    "message", "Error generating description: " + e.getMessage()
            ));
        }
    }

    @PostMapping("/generate/series/{seriesId}")
    public ResponseEntity<Map<String, Object>> generateDescriptionsForSeries(@PathVariable Long seriesId) {
        try {
            List<ComicBook> comics = comicBookRepository.findBySeriesIdAndDescriptionIsNull(seriesId);

            if (comics.isEmpty()) {
                return ResponseEntity.ok(Map.of(
                        "processed", 0,
                        "message", "No comics found without descriptions"
                ));
            }

            int processed = 0;
            for (ComicBook comic : comics) {
                try {
                    String description = descriptionGeneratorService.generateDescription(
                            comic.getSeries() != null ? comic.getSeries().getName() : "Unknown Series",
                            comic.getIssueNumber(),
                            comic.getTitle(),
                            comic.getCoverDate().toString(),
                            comic.getDescription()
                    );

                    comic.setDescription(description);
                    comicBookRepository.save(comic);
                    processed++;

                    // Rate limiting
                    Thread.sleep(1500);

                } catch (Exception e) {
                    log.error("Error processing comic {}: {}", comic.getId(), e.getMessage());
                }
            }

            return ResponseEntity.ok(Map.of(
                    "processed", processed,
                    "total", comics.size(),
                    "message", String.format("Generated descriptions for %d out of %d comics", processed, comics.size())
            ));

        } catch (Exception e) {
            log.error("Error generating descriptions for series {}: {}", seriesId, e.getMessage());
            return ResponseEntity.ok(Map.of(
                    "processed", 0,
                    "message", "Error: " + e.getMessage()
            ));
        }
    }

    @PostMapping("/generate/all")
    public ResponseEntity<Map<String, Object>> generateAllMissingDescriptions() {
        try {
            List<ComicBook> comics = comicBookRepository.findByDescriptionIsNullOrDescriptionEmpty();

            if (comics.isEmpty()) {
                return ResponseEntity.ok(Map.of(
                        "processed", 0,
                        "message", "No comics found without descriptions"
                ));
            }

            // Limit to 50 at a time to avoid timeouts
            int limit = Math.min(comics.size(), 50);
            int processed = 0;

            for (int i = 0; i < limit; i++) {
                ComicBook comic = comics.get(i);
                try {
                    String description = descriptionGeneratorService.generateDescription(
                            comic.getSeries() != null ? comic.getSeries().getName() : "Unknown Series",
                            comic.getIssueNumber(),
                            comic.getTitle(),
                            comic.getCoverDate().toString(),
                            comic.getDescription()
                    );

                    comic.setDescription(description);
                    comicBookRepository.save(comic);
                    processed++;

                    // Rate limiting - 2 second delay
                    Thread.sleep(2000);

                } catch (Exception e) {
                    log.error("Error processing comic {}: {}", comic.getId(), e.getMessage());
                }
            }

            return ResponseEntity.ok(Map.of(
                    "processed", processed,
                    "total", comics.size(),
                    "remaining", comics.size() - processed,
                    "message", String.format("Generated descriptions for %d comics. %d remaining.",
                            processed, comics.size() - processed)
            ));

        } catch (Exception e) {
            log.error("Error generating all descriptions: {}", e.getMessage());
            return ResponseEntity.ok(Map.of(
                    "processed", 0,
                    "message", "Error: " + e.getMessage()
            ));
        }
    }
}