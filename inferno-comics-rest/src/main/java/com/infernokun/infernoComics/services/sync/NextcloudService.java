package com.infernokun.infernoComics.services.sync;

import com.infernokun.infernoComics.config.InfernoComicsConfig;
import com.infernokun.infernoComics.exceptions.NextcloudFolderNotFound;
import com.infernokun.infernoComics.models.sync.NextcloudFile;
import com.infernokun.infernoComics.models.sync.NextcloudFolderInfo;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import javax.xml.XMLConstants;
import javax.xml.namespace.NamespaceContext;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.xpath.XPath;
import javax.xml.xpath.XPathConstants;
import javax.xml.xpath.XPathFactory;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Iterator;
import java.util.List;
import java.util.stream.Collectors;

@Service
@Slf4j
public class NextcloudService {

    private final WebClient webClient;
    private final InfernoComicsConfig infernoComicsConfig;

    public NextcloudService(InfernoComicsConfig infernoComicsConfig) {
        this.infernoComicsConfig = infernoComicsConfig;
        this.webClient = WebClient.builder()
                .baseUrl(infernoComicsConfig.getNextcloudUrl())
                .defaultHeader(HttpHeaders.AUTHORIZATION, createAuthHeader())
                .exchangeStrategies(ExchangeStrategies.builder()
                        .codecs(configurer -> configurer
                                .defaultCodecs()
                                .maxInMemorySize(500 * 1024 * 1024))
                        .build())
                .build();
    }

    private String createAuthHeader() {
        String credentials = infernoComicsConfig.getNextcloudUsername() + ":" +
                infernoComicsConfig.getNextcloudPassword();
        String encodedCredentials = Base64.getEncoder().encodeToString(credentials.getBytes());
        return "Basic " + encodedCredentials;
    }

    public NextcloudFolderInfo getFolderInfo(String folderPath) {
        folderPath = "/Photos/Comics/" + folderPath;
        String path = "/remote.php/dav/files/" + infernoComicsConfig.getNextcloudUsername() + folderPath + "/";
        String fullUrl = infernoComicsConfig.getNextcloudUrl() + path;

        try {
            log.info("Starting PROPFIND request...");

            String response = webClient
                    .method(HttpMethod.valueOf("PROPFIND"))
                    .uri(path)
                    .header("Depth", "1")
                    .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_XML_VALUE + "; charset=utf-8")
                    .retrieve()
                    .bodyToMono(String.class)
                    .timeout(Duration.ofSeconds(30))
                    .block();

            log.info("PROPFIND response received successfully, length: {}", response != null ? response.length() : 0);
            return parseWebDavResponse(response, folderPath);
        } catch (WebClientResponseException e) {
            throw new NextcloudFolderNotFound("Nextcloud folder: " + folderPath + " not found!");
        } catch (Exception e) {
            log.error("PROPFIND request failed for path: {} - Error: {}", folderPath, e.getMessage());
            throw new RuntimeException("Failed to access Nextcloud folder: " + folderPath, e);
        }
    }

    public List<NextcloudFile> getImageFiles(NextcloudFolderInfo currentFolderInfo) {
        return currentFolderInfo.getFiles().stream()
                .filter(this::isImageFile)
                .collect(Collectors.toList());
    }

    public byte[] downloadFile(String filePath) {
        String path = "/remote.php/dav/files/" + infernoComicsConfig.getNextcloudUsername() + "/Photos/Comics/" + filePath;

        log.info("Downloading file: {}", path);

        try {
            return webClient
                    .get()
                    .uri(path)
                    .retrieve()
                    .bodyToMono(byte[].class)
                    .timeout(Duration.ofSeconds(60))
                    .block();

        } catch (Exception e) {
            log.error("Failed to download file: {}", filePath, e);
            throw new RuntimeException("Failed to download file: " + filePath, e);
        }
    }

    private boolean isImageFile(NextcloudFile file) {
        if (file.isDirectory()) {
            return false;
        }
        String filename = file.getName().toLowerCase();
        return filename.endsWith(".jpg") || filename.endsWith(".jpeg") ||
                filename.endsWith(".png") || filename.endsWith(".gif") ||
                filename.endsWith(".webp") || filename.endsWith(".bmp");
    }

    public NextcloudFolderInfo parseWebDavResponse(String xmlResponse, String folderPath) {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            DocumentBuilder builder = factory.newDocumentBuilder();
            Document doc = builder.parse(new ByteArrayInputStream(xmlResponse.getBytes(StandardCharsets.UTF_8)));

            XPath xpath = XPathFactory.newInstance().newXPath();
            xpath.setNamespaceContext(new WebDavNamespaceContext());

            // Folder info
            String folderEtag = extractFolderEtag(doc, xpath, folderPath);
            LocalDateTime folderLastModified = extractFolderLastModified(doc, xpath, folderPath);

            // Files inside the folder
            List<NextcloudFile> files = extractFiles(doc, xpath, folderPath);

            return NextcloudFolderInfo.builder()
                    .folderPath(folderPath)
                    .etag(folderEtag)
                    .lastModified(folderLastModified)
                    .files(files)
                    .build();

        } catch (Exception e) {
            throw new RuntimeException("Failed to parse Nextcloud response", e);
        }
    }

    private String extractFolderEtag(Document doc, XPath xpath, String folderPath) throws Exception {
        return (String) xpath.evaluate(
                "//d:response[d:href='" + folderPath + "']//d:getetag",
                doc,
                XPathConstants.STRING
        );
    }

    private LocalDateTime extractFolderLastModified(Document doc, XPath xpath, String folderPath) throws Exception {
        String dateStr = (String) xpath.evaluate(
                "//d:response[d:href='" + folderPath + "']//d:getlastmodified",
                doc,
                XPathConstants.STRING
        );
        if (dateStr == null || dateStr.isEmpty()) return null;
        return ZonedDateTime.parse(dateStr, DateTimeFormatter.RFC_1123_DATE_TIME).toLocalDateTime();
    }

    private List<NextcloudFile> extractFiles(Document doc, XPath xpath, String folderPath) throws Exception {
        NodeList nodes = (NodeList) xpath.evaluate("//d:response", doc, XPathConstants.NODESET);
        List<NextcloudFile> files = new ArrayList<>();

        for (int i = 0; i < nodes.getLength(); i++) {
            Element resp = (Element) nodes.item(i);

            String href = xpath.evaluate("d:href", resp);

            // Skip the folder itself
            if (href.endsWith("/") && href.contains(folderPath)) {
                continue;
            }

            String name = href.substring(href.lastIndexOf("/") + 1);

            String etag = xpath.evaluate(".//d:getetag", resp);
            String contentLength = xpath.evaluate(".//d:getcontentlength", resp);
            String contentType = xpath.evaluate(".//d:getcontenttype", resp);
            //String lastModified = xpath.evaluate(".//d:getlastmodified", resp);
            String lastModified = xpath.evaluate(".//d:creationdate", resp);

            // Strip everything up to the Comics folder → relative path
            String relativePath = href.replaceFirst("^.*/Photos/Comics/", "");

            NextcloudFile file = NextcloudFile.builder()
                    .name(name)
                    .etag(etag)
                    .size(contentLength.isEmpty() ? null : Long.parseLong(contentLength))
                    .contentType(contentType)
                    .lastModified(lastModified.isEmpty() ? null :
                            ZonedDateTime.parse(lastModified, DateTimeFormatter.RFC_1123_DATE_TIME)
                                    .toLocalDateTime())
                    .path(relativePath) // ✅ only relative
                    .build();

            files.add(file);
        }
        return files;
    }


    private static class WebDavNamespaceContext implements NamespaceContext {
        @Override
        public String getNamespaceURI(String prefix) {
            switch (prefix) {
                case "d": return "DAV:";
                case "oc": return "http://owncloud.org/ns";
                case "nc": return "http://nextcloud.org/ns";
                case "s": return "http://sabredav.org/ns";
                default: return XMLConstants.NULL_NS_URI;
            }
        }
        @Override
        public String getPrefix(String uri) { return null; }
        @Override
        public Iterator<String> getPrefixes(String uri) { return null; }
    }
}