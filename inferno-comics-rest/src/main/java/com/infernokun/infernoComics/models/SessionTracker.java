package com.infernokun.infernoComics.models;

import lombok.Getter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.socket.WebSocketSession;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Getter
public class SessionTracker {
    Map<String, SessionDomain> domainMap = new HashMap<>();
    private final Logger LOGGER = LoggerFactory.getLogger(SessionTracker.class);

    public SessionTracker() {}

    public void addDomainSession(WebSocketSession session, String domain) {
        SessionDomain sessionDomain = getOrCreateDomain(domain);
        sessionDomain.getDomainSessions().add(session);
        LOGGER.info("Session added to domain: {} - {} sessions!", domain, sessionDomain.getDomainSessions().size());
    }

    public void addRoomSession(WebSocketSession session, String domain, String room) {
        List<WebSocketSession> roomSessions = getOrCreateRoom(domain, room);
        roomSessions.add(session);
        LOGGER.info("Session added to room: {} in domain: {} - {} sessions!", room, domain, roomSessions.size());
    }

    public void removeDomainSession(WebSocketSession session, String domain) {
        SessionDomain sessionDomain = domainMap.get(domain);
        if (sessionDomain != null) {
            sessionDomain.getDomainSessions().remove(session);
            LOGGER.info("Session removed from domain {}!", domain);
        } else {
            LOGGER.warn("Domain not found: {}", domain);
        }
    }

    public void removeRoomSession(WebSocketSession session, String domain, String room) {
        SessionDomain sessionDomain = this.domainMap.get(domain);
        if (sessionDomain != null) {
            List<WebSocketSession> roomSessions = sessionDomain.getRooms().get(room);
            if (roomSessions != null) {
                roomSessions.remove(session);
                LOGGER.info("Session removed from room: {} in domain {}", room, domain);
            } else {
                LOGGER.warn("Room not found: {} in domain {}", room, domain);
            }
        } else {
            LOGGER.warn("Domain not found: {}", domain);
        }
    }

    private SessionDomain getOrCreateDomain(String domain) {
        return this.domainMap.computeIfAbsent(domain, SessionDomain::new);
    }

    private List<WebSocketSession> getOrCreateRoom(String domain, String room) {
        SessionDomain sessionDomain = getOrCreateDomain(domain);
        return sessionDomain.getRooms().computeIfAbsent(room, k -> new ArrayList<>());
    }
}