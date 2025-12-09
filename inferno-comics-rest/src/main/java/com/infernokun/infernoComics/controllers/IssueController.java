package com.infernokun.infernoComics.controllers;

import com.fasterxml.jackson.databind.JsonNode;
import com.infernokun.infernoComics.models.ApiResponse;
import com.infernokun.infernoComics.models.Issue;
import com.infernokun.infernoComics.models.dto.IssueRequest;
import com.infernokun.infernoComics.services.IssueService;
import com.infernokun.infernoComics.services.ComicVineService.ComicVineIssueDto;

import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/issues")
public class IssueController {
    private final IssueService issueService;

    public IssueController(IssueService issueService) {
        this.issueService = issueService;
    }

    @GetMapping
    public ResponseEntity<List<Issue>> getAllIssues() {
        try {
            List<Issue> comicBooks = issueService.getAllIssues();
            return ResponseEntity.ok(comicBooks);
        } catch (Exception e) {
            log.error("Error fetching all issues: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<Issue> getIssueById(@PathVariable Long id) {
        try {
            return ResponseEntity.ok(issueService.getIssueById(id));
        } catch (Exception e) {
            log.error("Error fetching issue {}: {}", id, e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/series/{seriesId}")
    public ResponseEntity<List<Issue>> getIssuesBySeriesId(@PathVariable Long seriesId) {
        try {
            List<Issue> comicBooks = issueService.getIssuesBySeriesId(seriesId);
            return ResponseEntity.ok(comicBooks);
        } catch (Exception e) {
            log.error("Error fetching issues for series {}: {}", seriesId, e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/{seriesId}/search-comic-vine")
    public ResponseEntity<List<ComicVineIssueDto>> searchComicVineIssues(@PathVariable Long seriesId) {
        try {
            List<ComicVineIssueDto> issues = issueService.searchComicVineIssues(seriesId);
            return ResponseEntity.ok(issues);
        } catch (Exception e) {
            log.error("Error searching Comic Vine issues for series {}: {}", seriesId, e.getMessage());
            return ResponseEntity.ok(List.of());
        }
    }

    @GetMapping("/key-issues")
    public ResponseEntity<List<Issue>> getKeyIssues() {
        try {
            List<Issue> keyIssues = issueService.getKeyIssues();
            return ResponseEntity.ok(keyIssues);
        } catch (Exception e) {
            log.error("Error fetching key issues: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/search")
    public ResponseEntity<List<Issue>> searchIssues(@RequestParam String query, @RequestParam(defaultValue = "20") int limit) {
        try {
            List<Issue> results = issueService.searchIssues(query, limit);
            return ResponseEntity.ok(results);
        } catch (Exception e) {
            log.error("Error searching issues: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/recent")
    public ResponseEntity<List<Issue>> getRecentIssues(@RequestParam(defaultValue = "10") int limit) {
        try {
            List<Issue> recentComics = issueService.getRecentIssues(limit);
            return ResponseEntity.ok(recentComics);
        } catch (Exception e) {
            log.error("Error fetching recent issues: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getIssueStats() {
        try {
            Map<String, Object> stats = issueService.getIssueStats();
            return ResponseEntity.ok(stats);
        } catch (Exception e) {
            log.error("Error fetching issue statistics: {}", e.getMessage());
            return ResponseEntity.ok(Map.of("error", "Unable to fetch statistics"));
        }
    }

    @GetMapping("/get-comic-vine/{comicVineId}")
    public ResponseEntity<ApiResponse<ComicVineIssueDto>> getComicVineIssueById(@PathVariable Long comicVineId) {
        return ResponseEntity.ok(ApiResponse.<ComicVineIssueDto>builder().data(issueService.getComicVineIssueById(comicVineId)).build());
    }

    @PostMapping
    public ResponseEntity<Issue> createIssue(@RequestPart("issue") IssueRequest request,
                                             @RequestPart(value = "imageData", required = false) MultipartFile imageData) {
        try {
            JsonNode node;
            if (imageData != null && !imageData.isEmpty()) {
                node = issueService.placeImageUpload(imageData);
                request.setUploadedImageUrl(node.get("link").asText());
                log.error(request.getUploadedImageUrl());
            }

            Issue issue = issueService.createIssue(request);
            return ResponseEntity.ok(issue);
        } catch (IllegalArgumentException e) {
            log.warn("Invalid request for creating issue: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        } catch (Exception e) {
            log.error("Error creating issue: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/bulk")
    @ResponseStatus(HttpStatus.CREATED)
    public ResponseEntity<List<Issue>> createIssuesBulk(@RequestBody @Valid List<IssueRequest> requests) {
        try {
            List<Issue> createdIssues = issueService.createIssuesBulk(requests);
            return ResponseEntity.status(HttpStatus.CREATED).body(createdIssues);
        } catch (Exception e) {
            log.error("Error creating issues in bulk: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/bulk-delete")
    public ResponseEntity<Issue.BulkDeleteResult> deleteIssuesBulk(@RequestBody List<Long> issueIds) {
        try {
            Issue.BulkDeleteResult result = issueService.deleteIssuesBulk(issueIds);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("Error in bulk delete: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/batch/from-comic-vine")
    public ResponseEntity<List<Issue>> createIssuesFromComicVine(@RequestParam Long seriesId,
                                                                 @RequestBody List<String> comicVineIssueIds) {
        try {
            List<Issue> comicBooks = issueService.createIssuesFromComicVine(seriesId, comicVineIssueIds);
            return ResponseEntity.ok(comicBooks);
        } catch (IllegalArgumentException e) {
            log.warn("Invalid request for batch creating issues: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        } catch (Exception e) {
            log.error("Error batch creating issues from Comic Vine: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @PutMapping(value = "/{id}")
    public ResponseEntity<Issue> updateIssue(@PathVariable Long id, @RequestPart("issue") IssueRequest request,
            @RequestPart(value = "imageData", required = false) MultipartFile imageData) {

        try {
            JsonNode node;
            if (imageData != null && !imageData.isEmpty()) {
                node = issueService.placeImageUpload(imageData);
                request.setUploadedImageUrl(node.get("link").asText());
            } else {
                log.info("No image supplied for issue {}", id);
            }

            Issue comicBook = issueService.updateIssue(id, request);

            return ResponseEntity.ok(comicBook);
        } catch (IllegalArgumentException e) {
            log.warn("Invalid request for updating issue {}: {}", id, e.getMessage());
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            log.error("Error updating issue {}: {}", id, e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteIssue(@PathVariable Long id) {
        try {
            issueService.deleteIssue(id);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            log.warn("Issue {} not found for deletion", id);
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            log.error("Error deleting issue {}: {}", id, e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @DeleteMapping("/cache")
    public ResponseEntity<Void> clearIssueCaches() {
        try {
            issueService.clearAllIssueCaches();
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            log.error("Error clearing issue caches: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }
}