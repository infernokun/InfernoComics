package com.infernokun.infernoComics.services.sync;

import com.infernokun.infernoComics.clients.InfernoComicsWebClient;
import com.infernokun.infernoComics.config.InfernoComicsConfig;
import com.infernokun.infernoComics.exceptions.NextcloudFolderNotFound;
import com.infernokun.infernoComics.models.sync.NextcloudFile;
import com.infernokun.infernoComics.models.sync.NextcloudFolderInfo;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
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
import java.util.Iterator;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class NextcloudService {
    private final InfernoComicsWebClient webClient;
    private final InfernoComicsConfig infernoComicsConfig;

    public NextcloudFolderInfo getFolderInfo(String folderPath) {
        folderPath = infernoComicsConfig.getNextcloudFolderLocation() + folderPath;
        String path = "/remote.php/dav/files/" + infernoComicsConfig.getNextcloudUsername() + folderPath;

        try {
            log.info("Starting PROPFIND request...");

            String response = webClient.nextcloudClient()
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
            if (e.getStatusCode() == HttpStatus.NOT_FOUND) {
                log.info("Folder not found, attempting to create: {}", folderPath);

                // Try to create the folder and retry
                if (createFolderRecursively(folderPath)) {
                    log.info("Folder created successfully, retrying PROPFIND...");
                    return retryGetFolderInfo(folderPath, path);
                } else {
                    throw new NextcloudFolderNotFound("Failed to create Nextcloud folder: " + folderPath);
                }
            } else {
                throw new NextcloudFolderNotFound("Nextcloud folder access failed: " + folderPath + " - " + e.getMessage());
            }
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
        String path = "/remote.php/dav/files/" + infernoComicsConfig.getNextcloudUsername() +
                infernoComicsConfig.getNextcloudFolderLocation() + filePath;

        log.info("Downloading file: {}", path);

        try {
            return webClient.nextcloudClient()
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

            String etag = xpath.evaluate(".//d:getetag", resp).replace("\"", "");
            String contentLength = xpath.evaluate(".//d:getcontentlength", resp);
            String contentType = xpath.evaluate(".//d:getcontenttype", resp);
            String lastModified = xpath.evaluate(".//d:getlastmodified", resp);

            // Strip everything up to the Comics folder → relative path
            String relativePath = href.replaceFirst("^.*" + infernoComicsConfig.getNextcloudFolderLocation(), "");

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
            return switch (prefix) {
                case "d" -> "DAV:";
                case "oc" -> "http://owncloud.org/ns";
                case "nc" -> "http://nextcloud.org/ns";
                case "s" -> "http://sabredav.org/ns";
                default -> XMLConstants.NULL_NS_URI;
            };
        }
        @Override
        public String getPrefix(String uri) { return null; }
        @Override
        public Iterator<String> getPrefixes(String uri) { return null; }
    }

    private NextcloudFolderInfo retryGetFolderInfo(String folderPath, String path) {
        try {
            String response = webClient.nextcloudClient()
                    .method(HttpMethod.valueOf("PROPFIND"))
                    .uri(path)
                    .header("Depth", "1")
                    .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_XML_VALUE + "; charset=utf-8")
                    .retrieve()
                    .bodyToMono(String.class)
                    .timeout(Duration.ofSeconds(30))
                    .block();

            log.info("Retry PROPFIND response received successfully, length: {}", response != null ? response.length() : 0);
            return parseWebDavResponse(response, folderPath);
        } catch (Exception e) {
            log.error("Retry PROPFIND request failed for path: {} - Error: {}", folderPath, e.getMessage());
            throw new RuntimeException("Failed to access newly created Nextcloud folder: " + folderPath, e);
        }
    }

    private boolean createFolderRecursively(String folderPath) {
        try {
            // Split the path into segments and create each folder level
            String[] pathSegments = folderPath.split("/");
            StringBuilder currentPath = new StringBuilder();

            for (String segment : pathSegments) {
                if (segment.isEmpty()) continue;

                currentPath.append("/").append(segment);
                String fullPath = "/remote.php/dav/files/" + infernoComicsConfig.getNextcloudUsername() + currentPath;

                // Check if this path segment already exists
                if (!folderExists(fullPath)) {
                    log.info("Creating folder segment: {}", currentPath.toString());
                    createSingleFolder(fullPath);
                }
            }

            return true;
        } catch (Exception e) {
            log.error("Failed to create folder recursively: {} - Error: {}", folderPath, e.getMessage());
            return false;
        }
    }

    private boolean folderExists(String path) {
        try {
            webClient.nextcloudClient()
                    .method(HttpMethod.valueOf("PROPFIND"))
                    .uri(path + "/")
                    .header("Depth", "0")
                    .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_XML_VALUE + "; charset=utf-8")
                    .retrieve()
                    .bodyToMono(String.class)
                    .timeout(Duration.ofSeconds(10))
                    .block();
            return true;
        } catch (WebClientResponseException e) {
            return e.getStatusCode() != HttpStatus.NOT_FOUND;
        } catch (Exception e) {
            log.debug("Error checking folder existence: {}", e.getMessage());
            return false;
        }
    }

    private void createSingleFolder(String path) {
        try {
            webClient.nextcloudClient()
                    .method(HttpMethod.valueOf("MKCOL"))
                    .uri(path + "/")
                    .retrieve()
                    .bodyToMono(String.class)
                    .timeout(Duration.ofSeconds(30))
                    .block();

            log.info("Successfully created folder: {}", path);
        } catch (WebClientResponseException e) {
            if (e.getStatusCode() == HttpStatus.METHOD_NOT_ALLOWED) {
                // Folder might already exist
                log.debug("Folder might already exist: {}", path);
            } else {
                log.error("Failed to create folder: {} - Status: {}", path, e.getStatusCode());
                throw e;
            }
        } catch (Exception e) {
            log.error("Failed to create folder: {} - Error: {}", path, e.getMessage());
            throw new RuntimeException("Failed to create folder: " + path, e);
        }
    }
}