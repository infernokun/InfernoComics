package com.infernokun.infernoComics.controllers;

import com.infernokun.infernoComics.models.Issue;
import com.infernokun.infernoComics.models.DescriptionGenerated;
import com.infernokun.infernoComics.repositories.IssueRepository;
import com.infernokun.infernoComics.services.DescriptionGeneratorService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/descriptions")
public class DescriptionController {

    private final DescriptionGeneratorService descriptionGeneratorService;
    private final IssueRepository issueRepository;

    @GetMapping("/cache/stats")
    public ResponseEntity<Map<String, Object>> getCacheStats() {
        try {
            Map<String, Object> stats = descriptionGeneratorService.getCacheStats();
            return ResponseEntity.ok(stats);
        } catch (Exception e) {
            log.error("Error getting cache stats: {}", e.getMessage());
            return ResponseEntity.ok(Map.of(
                    "error", "Unable to retrieve cache statistics",
                    "message", e.getMessage()
            ));
        }
    }

    @PostMapping("/generate/{issueId}")
    public ResponseEntity<Map<String, String>> generateDescriptionForIssue(@PathVariable Long issueId) {
        try {
            Optional<Issue> issueOptional = issueRepository.findById(issueId);

            if (issueOptional.isEmpty()) {
                return ResponseEntity.notFound().build();
            }

            Issue issue = issueOptional.get();
            DescriptionGenerated description = descriptionGeneratorService.generateDescription(
                    issue.getSeries() != null ? issue.getSeries().getName() : "Unknown Series",
                    issue.getIssueNumber(),
                    issue.getTitle(),
                    issue.getCoverDate() != null ? issue.getCoverDate().toString() : null,
                    issue.getDescription()
            );

            // Update the issue with the new description
            issue.setDescription(description.getDescription());
            issue.setGeneratedDescription(description.isGenerated());
            issueRepository.save(issue);

            return ResponseEntity.ok(Map.of(
                    "description", description.getDescription(),
                    "message", description.isGenerated() ? "Description generated successfully" : "Default description used"
            ));

        } catch (Exception e) {
            log.error("Error generating description for issue {}: {}", issueId, e.getMessage());
            return ResponseEntity.ok(Map.of(
                    "description", "",
                    "message", "Error generating description: " + e.getMessage()
            ));
        }
    }

    @PostMapping("/generate/series/{seriesId}")
    public ResponseEntity<Map<String, Object>> generateDescriptionsForSeries(@PathVariable Long seriesId) {
        try {
            List<Issue> issues = issueRepository.findBySeriesIdAndDescriptionIsNull(seriesId);

            if (issues.isEmpty()) {
                return ResponseEntity.ok(Map.of(
                        "processed", 0,
                        "message", "No issues found without descriptions"
                ));
            }

            int processed = 0;
            for (Issue issue : issues) {
                try {
                    DescriptionGenerated description = descriptionGeneratorService.generateDescription(
                            issue.getSeries() != null ? issue.getSeries().getName() : "Unknown Series",
                            issue.getIssueNumber(),
                            issue.getTitle(),
                            issue.getCoverDate() != null ? issue.getCoverDate().toString() : null,
                            issue.getDescription()
                    );

                    issue.setDescription(description.getDescription());
                    issue.setGeneratedDescription(description.isGenerated());
                    issueRepository.save(issue);
                    processed++;

                    // Rate limiting
                    Thread.sleep(1500);

                } catch (Exception e) {
                    log.error("Error processing issue {}: {}", issue.getId(), e.getMessage());
                }
            }

            return ResponseEntity.ok(Map.of(
                    "processed", processed,
                    "total", issues.size(),
                    "message", String.format("Generated descriptions for %d out of %d issues", processed, issues.size())
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
            List<Issue> issues = issueRepository.findByDescriptionIsNullOrDescriptionEmpty();

            if (issues.isEmpty()) {
                return ResponseEntity.ok(Map.of(
                        "processed", 0,
                        "message", "No issues found without descriptions"
                ));
            }

            // Limit to 50 at a time to avoid timeouts
            int limit = Math.min(issues.size(), 50);
            int processed = 0;

            for (int i = 0; i < limit; i++) {
                Issue issue = issues.get(i);
                try {
                    DescriptionGenerated description = descriptionGeneratorService.generateDescription(
                            issue.getSeries() != null ? issue.getSeries().getName() : "Unknown Series",
                            issue.getIssueNumber(),
                            issue.getTitle(),
                            issue.getCoverDate() != null ? issue.getCoverDate().toString() : null,
                            issue.getDescription()
                    );

                    issue.setDescription(description.getDescription());
                    issue.setGeneratedDescription(description.isGenerated());
                    issueRepository.save(issue);
                    processed++;

                    // Rate limiting - 2 second delay
                    Thread.sleep(2000);

                } catch (Exception e) {
                    log.error("Error processing issue {}: {}", issue.getId(), e.getMessage());
                }
            }

            return ResponseEntity.ok(Map.of(
                    "processed", processed,
                    "total", issues.size(),
                    "remaining", issues.size() - processed,
                    "message", String.format("Generated descriptions for %d issues. %d remaining.",
                            processed, issues.size() - processed)
            ));

        } catch (Exception e) {
            log.error("Error generating all descriptions: {}", e.getMessage());
            return ResponseEntity.ok(Map.of(
                    "processed", 0,
                    "message", "Error: " + e.getMessage()
            ));
        }
    }

    @PostMapping("/refresh/{issueId}")
    public ResponseEntity<Map<String, String>> refreshDescriptionForIssue(@PathVariable Long issueId) {
        try {
            Optional<Issue> issueOptional = issueRepository.findById(issueId);

            if (issueOptional.isEmpty()) {
                return ResponseEntity.notFound().build();
            }

            Issue issue = issueOptional.get();

            // Force refresh the description (bypasses cache)
            String refreshedDescription = descriptionGeneratorService.refreshDescription(
                    issue.getSeries() != null ? issue.getSeries().getName() : "Unknown Series",
                    issue.getIssueNumber(),
                    issue.getTitle(),
                    issue.getCoverDate() != null ? issue.getCoverDate().toString() : null
            );

            // Update the issue with the refreshed description
            issue.setDescription(refreshedDescription);
            issue.setGeneratedDescription(true);
            issueRepository.save(issue);

            return ResponseEntity.ok(Map.of(
                    "description", refreshedDescription,
                    "message", "Description refreshed successfully"
            ));

        } catch (Exception e) {
            log.error("Error refreshing description for issue {}: {}", issueId, e.getMessage());
            return ResponseEntity.ok(Map.of(
                    "description", "",
                    "message", "Error refreshing description: " + e.getMessage()
            ));
        }
    }

    @DeleteMapping("/cache/clear")
    public ResponseEntity<Map<String, String>> clearDescriptionCache() {
        try {
            descriptionGeneratorService.clearAllDescriptionCache();
            return ResponseEntity.ok(Map.of(
                    "message", "Description cache cleared successfully"
            ));
        } catch (Exception e) {
            log.error("Error clearing description cache: {}", e.getMessage());
            return ResponseEntity.ok(Map.of(
                    "error", "Failed to clear cache",
                    "message", e.getMessage()
            ));
        }
    }

    @DeleteMapping("/cache/invalidate/{issueId}")
    public ResponseEntity<Map<String, String>> invalidateDescriptionForIssue(@PathVariable Long issueId) {
        try {
            Optional<Issue> issueOptional = issueRepository.findById(issueId);

            if (issueOptional.isEmpty()) {
                return ResponseEntity.notFound().build();
            }

            Issue issue = issueOptional.get();

            // Invalidate the cache for this specific issue
            descriptionGeneratorService.invalidateDescription(
                    issue.getSeries() != null ? issue.getSeries().getName() : "Unknown Series",
                    issue.getIssueNumber(),
                    issue.getTitle()
            );

            return ResponseEntity.ok(Map.of(
                    "message", "Description cache invalidated for issue " + issueId
            ));

        } catch (Exception e) {
            log.error("Error invalidating description cache for issue {}: {}", issueId, e.getMessage());
            return ResponseEntity.ok(Map.of(
                    "error", "Failed to invalidate cache",
                    "message", e.getMessage()
            ));
        }
    }
}