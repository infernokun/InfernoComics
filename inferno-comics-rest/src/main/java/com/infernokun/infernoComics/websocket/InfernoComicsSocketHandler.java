package com.infernokun.infernoComics.websocket;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.ObjectWriter;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.datatype.jsr310.deser.LocalDateTimeDeserializer;
import com.fasterxml.jackson.datatype.jsr310.ser.LocalDateTimeSerializer;
import lombok.Builder;
import lombok.Data;
import lombok.NonNull;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

@Slf4j
public class InfernoComicsSocketHandler extends TextWebSocketHandler {
    private final List<WebSocketSession> currentSessions = new CopyOnWriteArrayList<>();
    private final ObjectWriter writer;
    private final ObjectMapper mapper;

    public InfernoComicsSocketHandler() {
        mapper = new ObjectMapper();
        writer = new ObjectMapper().writerFor(HeartbeatDTO.class);
    }

    @Override
    public void afterConnectionEstablished(@NonNull WebSocketSession session) {
        this.currentSessions.add(session);
        log.info("WEBSOCKET Connection Established w ID: {}", session.getId());
    }

    @Override
    public void afterConnectionClosed(@NonNull WebSocketSession session, @NonNull CloseStatus status) {
        this.currentSessions.remove(session);
        log.info("WEBSOCKET Connection Closed for ID: {}", session.getId());
    }

    public void broadcastObjUpdate(Object storedObject) {
        // 1️⃣ Convert the POJO to a mutable JSON node (uses the configured mapper)
        mapper.disable(MapperFeature.REQUIRE_HANDLERS_FOR_JAVA8_TIMES);
        ObjectNode jsonNode = mapper.valueToTree(storedObject);

        // 2️⃣ Add a simple class‑name field for the client
        jsonNode.put("name", storedObject.getClass().getSimpleName());

        // 3️⃣ Serialize once – the same payload is sent to all sessions
        String payload = jsonNode.toString();
        TextMessage message = new TextMessage(payload);

        // 4️⃣ Send to each open session
        for (WebSocketSession session : currentSessions) {
            if (!session.isOpen()) {
                log.warn("WebSocket session is not open: {}", session.getId());
                continue;
            }
            try {
                session.sendMessage(message);
            } catch (IOException ex) {
                log.warn("WebSocket error sending message to session {}: {}", session.getId(), ex.getMessage());
            }
        }
    }

    public void broadcastObjectUpdate(Object storedObject) {
        for (WebSocketSession session : this.currentSessions) {
            try {
                if (session.isOpen()) {
                    ObjectNode storedObjectJsonObject = new ObjectMapper().readValue(storedObject.toString(), ObjectNode.class);

                    String[] classNameParts = storedObject.getClass().getName().split("\\.");
                    storedObjectJsonObject.put("name", classNameParts[classNameParts.length - 1]);

                    TextMessage storedObjectMessage = new TextMessage(storedObjectJsonObject.toString());
                    session.sendMessage(storedObjectMessage);
                } else {
                    log.warn("WEBSOCKET Session is not open: {}", session.getId());
                }
            } catch (IOException ex) {
                log.warn("WEBSOCKET Error sending message to session {}: {}", session.getId(), ex.getMessage());
            }
        }
    }

    @Scheduled(fixedRateString = "${SOCKET_POLL_MS:30000}")
    public void sendHeartbeatToClients() {
        for (WebSocketSession session : this.currentSessions) {
            try {
                if (session.isOpen()) {
                    session.sendMessage(new TextMessage(writer.writeValueAsString(
                            HeartbeatDTO
                                    .builder()
                                    .type("heartbeat")
                                    .timestamp(LocalDateTime.now())
                                    .session(session.getId())
                                    .build())));
                }
            } catch (IOException e) {
                log.warn("WEBSOCKET issue sending heartbeat: {}", session.getId(), e);
            }
        }
    }

    @Data
    @Builder
    private static class HeartbeatDTO {
        private String type;
        @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd HH:mm:ss")
        @JsonDeserialize(using = LocalDateTimeDeserializer.class)
        @JsonSerialize(using = LocalDateTimeSerializer.class)
        private LocalDateTime timestamp;
        private String session;
    }
}