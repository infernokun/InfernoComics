package com.infernokun.infernoComics.logger;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;

import java.io.IOException;
import java.util.Set;
import java.util.UUID;

@Slf4j
public class InfernoComicsLogger implements Filter {

    private static final String REQUEST_ID_ATTRIBUTE = "requestId";
    private static final String START_TIME_ATTRIBUTE = "startTime";
    private static final String SEPARATOR = " | ";
    private static final String REQUEST_PREFIX = "→ REQ";
    private static final String RESPONSE_PREFIX = "← RES";

    private final Set<String> excludedUrls = Set.of(
            "/health",
            "/actuator"
    );

    @Override
    public void doFilter(ServletRequest servletRequest, ServletResponse servletResponse, FilterChain filterChain)
            throws IOException, ServletException {

        HttpServletRequest httpRequest = (HttpServletRequest) servletRequest;
        HttpServletResponse httpResponse = (HttpServletResponse) servletResponse;

        String requestUri = httpRequest.getRequestURI();
        String requestId = UUID.randomUUID().toString().substring(0, 8);
        long startTime = System.currentTimeMillis();

        // Set request attributes for potential use by other components
        httpRequest.setAttribute(REQUEST_ID_ATTRIBUTE, requestId);
        httpRequest.setAttribute(START_TIME_ATTRIBUTE, startTime);

        // Log incoming request
        if (isIncludedUrl(requestUri)) {
            logIncomingRequest(httpRequest, requestId);
        }

        try {
            filterChain.doFilter(servletRequest, servletResponse);

            // Log successful response
            if (isIncludedUrl(requestUri)) {
                logResponse(httpRequest, httpResponse, requestId, startTime, null);
            }

        } catch (IOException | ServletException ex) {
            // Log error response
            if (isIncludedUrl(requestUri)) {
                logResponse(httpRequest, httpResponse, requestId, startTime, ex);
            }
            throw ex;
        }
    }

    private boolean isIncludedUrl(String requestUri) {
        return excludedUrls.stream().noneMatch(requestUri::startsWith);
    }

    private void logIncomingRequest(HttpServletRequest request, String requestId) {
        String clientIp = getClientIpAddress(request);
        String userAgent = getUserAgentShort(request.getHeader("User-Agent"));
        String referer = request.getHeader("Referer");

        log.info("{} [{}]{}{}{}{}{}{}{}{}",
                REQUEST_PREFIX,
                requestId,
                SEPARATOR,
                request.getMethod(),
                SEPARATOR,
                formatUrl(request),
                SEPARATOR,
                clientIp,
                formatOptionalField("Agent", userAgent),
                formatOptionalField("Ref", referer)
        );
    }

    private void logResponse(HttpServletRequest request, HttpServletResponse response,
                             String requestId, long startTime, Exception exception) {

        long duration = System.currentTimeMillis() - startTime;
        String clientIp = getClientIpAddress(request);

        if (exception != null) {
            log.error("{} [{}]{}{}{}{}{}{}{}{}{}",
                    RESPONSE_PREFIX,
                    requestId,
                    SEPARATOR,
                    request.getMethod(),
                    SEPARATOR,
                    formatUrl(request),
                    SEPARATOR,
                    clientIp,
                    SEPARATOR,
                    formatStatus("ERROR", true),
                    formatDuration(duration) + formatError(exception.getMessage())
            );
        } else {
            int status = response.getStatus();
            boolean isError = status >= 400;

            if (isError) {
                log.warn("{} [{}]{}{}{}{}{}{}{}{}",
                        RESPONSE_PREFIX,
                        requestId,
                        SEPARATOR,
                        request.getMethod(),
                        SEPARATOR,
                        formatUrl(request),
                        SEPARATOR,
                        clientIp,
                        SEPARATOR,
                        formatStatus(String.valueOf(status), true) + formatDuration(duration)
                );
            } else {
                log.info("{} [{}]{}{}{}{}{}{}{}{}",
                        RESPONSE_PREFIX,
                        requestId,
                        SEPARATOR,
                        request.getMethod(),
                        SEPARATOR,
                        formatUrl(request),
                        SEPARATOR,
                        clientIp,
                        SEPARATOR,
                        formatStatus(String.valueOf(status), false) + formatDuration(duration)
                );
            }
        }
    }

    private String formatUrl(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String query = request.getQueryString();

        if (query != null) {
            return uri + "?" + query;
        }
        return uri;
    }

    private String formatStatus(String status, boolean isError) {
        if (isError) {
            return String.format("Status: %-5s", status);
        }
        return String.format("Status: %-3s", status);
    }

    private String formatDuration(long duration) {
        String durationStr;
        if (duration < 1000) {
            durationStr = duration + "ms";
        } else if (duration < 60000) {
            durationStr = String.format("%.2fs", duration / 1000.0);
        } else {
            durationStr = String.format("%.1fm", duration / 60000.0);
        }
        return SEPARATOR + String.format("⏱ %-8s", durationStr);
    }

    private String formatOptionalField(String label, String value) {
        if (value != null && !value.trim().isEmpty() && !"N/A".equals(value)) {
            return SEPARATOR + label + ": " + value;
        }
        return "";
    }

    private String formatError(String errorMessage) {
        if (errorMessage != null && !errorMessage.trim().isEmpty()) {
            return SEPARATOR + "❌ " + errorMessage;
        }
        return "";
    }

    private String getUserAgentShort(String userAgent) {
        if (userAgent == null || userAgent.trim().isEmpty()) {
            return null;
        }

        // Extract browser name for cleaner display
        if (userAgent.contains("Chrome") && !userAgent.contains("Edg")) {
            return "Chrome";
        } else if (userAgent.contains("Firefox")) {
            return "Firefox";
        } else if (userAgent.contains("Safari") && !userAgent.contains("Chrome")) {
            return "Safari";
        } else if (userAgent.contains("Edg")) {
            return "Edge";
        } else if (userAgent.contains("Postman")) {
            return "Postman";
        } else if (userAgent.contains("curl")) {
            return "curl";
        } else if (userAgent.contains("Java")) {
            return "Java Client";
        }

        // Return first 20 characters if no known browser
        return userAgent.length() > 20 ? userAgent.substring(0, 20) + "..." : userAgent;
    }

    private String getClientIpAddress(HttpServletRequest request) {
        // Check for common proxy headers
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty() && !"unknown".equalsIgnoreCase(xForwardedFor)) {
            // X-Forwarded-For can contain multiple IPs, take the first one
            return xForwardedFor.split(",")[0].trim();
        }

        String xRealIp = request.getHeader("X-Real-IP");
        if (xRealIp != null && !xRealIp.isEmpty() && !"unknown".equalsIgnoreCase(xRealIp)) {
            return xRealIp;
        }

        return request.getRemoteAddr();
    }

    @Override
    public void init(FilterConfig filterConfig) {
        log.info("🚀 InfernoComics initialized | Excluded URLs: {}", excludedUrls);
    }

    @Override
    public void destroy() {
        log.info("🛑 InfernoComics destroyed");
    }
}