package com.infernokun.infernoComics.services;

import com.infernokun.infernoComics.clients.InfernoComicsWebClient;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.springframework.stereotype.Service;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;

@Slf4j
@Service
public class SearxngImageSearchService {
    private final InfernoComicsWebClient webClient;

    public SearxngImageSearchService(InfernoComicsWebClient webClient) {
        this.webClient = webClient;
    }

    public List<String> findVariantImages(String seriesName,
                                          int issueNumber,
                                          String publisher) {
        try {
            String query = String.format(
                    "%s #%d variant cover %s",
                    seriesName,
                    issueNumber,
                    publisher
            );

            String encodedQuery = URLEncoder.encode(query, StandardCharsets.UTF_8);

            String html = webClient.searxngClient().get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/search")
                            .queryParam("q", encodedQuery)
                            .queryParam("categories", "images")
                            .queryParam("language", "auto")
                            .queryParam("safesearch", "0")
                            .queryParam("theme", "simple")
                            .build()
                    )
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            if (html == null) return List.of();

            Document doc = Jsoup.parse(html);

            return doc.select("a.result-images-source")
                    .stream()
                    .limit(5)
                    .map(el -> el.attr("href"))
                    .filter(url -> !url.isBlank())
                    .toList();

        } catch (Exception e) {
            log.warn("Variant search failed: {}", e.getMessage());
            return List.of();
        }
    }
}
