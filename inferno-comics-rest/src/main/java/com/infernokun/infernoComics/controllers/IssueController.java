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

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/issues")
public class IssueController extends BaseController {
    private final IssueService issueService;

    public IssueController(IssueService issueService) {
        this.issueService = issueService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<Issue>>> getAllIssues() {
        return createSuccessResponse(issueService.getAllIssues());
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<Issue>> getIssueById(@PathVariable Long id) {
        return createSuccessResponse(issueService.getIssueById(id));
    }

    @GetMapping("/series/{seriesId}")
    public ResponseEntity<ApiResponse<List<Issue>>> getIssuesBySeriesId(@PathVariable Long seriesId) {
        return createSuccessResponse(issueService.getIssuesBySeriesId(seriesId));
    }

    @GetMapping("/{seriesId}/search-comic-vine")
    public ResponseEntity<ApiResponse<List<ComicVineIssueDto>>> searchComicVineIssues(@PathVariable Long seriesId) {
        return createSuccessResponse(issueService.searchComicVineIssues(seriesId));
    }

    @GetMapping("/key-issues")
    public ResponseEntity<ApiResponse<List<Issue>>> getKeyIssues() {
        return createSuccessResponse(issueService.getKeyIssues());
    }

    @GetMapping("/search")
    public ResponseEntity<ApiResponse<List<Issue>>> searchIssues(@RequestParam String query, @RequestParam(defaultValue = "20") int limit) {
        return createSuccessResponse(issueService.searchIssues(query, limit));
    }

    @GetMapping("/recent")
    public ResponseEntity<ApiResponse<List<Issue>>> getRecentIssues(@RequestParam(defaultValue = "10") int limit) {
        return createSuccessResponse(issueService.getRecentIssues(limit));
    }

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getIssueStats() {
        return createSuccessResponse(issueService.getIssueStats());
    }

    @GetMapping("/total-value")
    public ResponseEntity<ApiResponse<BigDecimal>> getIssueTotalValue(@RequestParam String type) {
        if ("current".equals(type)) {
            BigDecimal total = issueService.getAllIssues().stream()
                .map(Issue::getCurrentValue)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
            return createSuccessResponse(total);
        } else if ("purchase".equals(type)) {
            BigDecimal total = issueService.getAllIssues().stream()
                .map(Issue::getPurchasePrice)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
            return createSuccessResponse(total);
        } else {
            return createErrorResponse("What?");
        }
    }

    @GetMapping("/get-comic-vine/{comicVineId}")
    public ResponseEntity<ApiResponse<ComicVineIssueDto>> getComicVineIssueById(@PathVariable Long comicVineId) {
        return createSuccessResponse(issueService.getComicVineIssueById(comicVineId));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<Issue>> createIssue(@RequestPart("issue") IssueRequest request,
                                                          @RequestPart(
                                                                  value = "imageData", required = false
                                                          )
                                                          MultipartFile imageData) {
        JsonNode node;
        if (imageData != null && !imageData.isEmpty()) {
            node = issueService.placeImageUpload(imageData);
            request.setUploadedImageUrl(node.get("link").asText());
        }

        return createSuccessResponse(issueService.createIssue(request));
    }

    @PostMapping("/bulk")
    public ResponseEntity<ApiResponse<List<Issue>>> createIssuesBulk(@RequestBody @Valid List<IssueRequest> requests) {
        return createSuccessResponse(issueService.createIssuesBulk(requests));
    }

    @PostMapping("/bulk-delete")
    public ResponseEntity<ApiResponse<Issue.BulkDeleteResult>> deleteIssuesBulk(@RequestBody List<Long> issueIds) {
        return createSuccessResponse(issueService.deleteIssuesBulk(issueIds));
    }

    @PostMapping("/batch/from-comic-vine")
    public ResponseEntity<ApiResponse<List<Issue>>> createIssuesFromComicVine(@RequestParam Long seriesId,
                                                                              @RequestBody List<String> comicVineIssueIds) {
        return createSuccessResponse(issueService.createIssuesFromComicVine(seriesId, comicVineIssueIds));
    }

    @PutMapping(value = "/{id}")
    public ResponseEntity<ApiResponse<Issue>> updateIssue(@PathVariable Long id, @RequestPart("issue") IssueRequest request,
                                                          @RequestPart(
                                                                  value = "imageData", required = false
                                                          )
                                                          MultipartFile imageData) {
        if (imageData != null && !imageData.isEmpty()) {
            JsonNode node = issueService.placeImageUpload(imageData);
            request.setUploadedImageUrl(node.get("link").asText());
        } else {
            log.info("No image supplied for issue {}", id);
        }

        return createSuccessResponse(issueService.updateIssue(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteIssue(@PathVariable Long id) {
        issueService.deleteIssue(id);
        return createSuccessResponse();
    }

    @DeleteMapping("/cache")
    public ResponseEntity<ApiResponse<Object>> clearIssueCaches() {
        issueService.clearAllIssueCaches();
        return createSuccessResponse();
    }
}