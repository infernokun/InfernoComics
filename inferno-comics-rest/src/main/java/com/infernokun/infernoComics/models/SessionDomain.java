package com.infernokun.amaterasu.models.sessions;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.web.socket.WebSocketSession;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@NoArgsConstructor
@Getter
@Setter
public class SessionDomain {
    private String domainName;
    private Map<String, List<WebSocketSession>> rooms;
    private List<WebSocketSession> domainSessions;

    public SessionDomain(String name) {
        this.domainName = name;
        this.rooms = new HashMap<>();
        this.domainSessions = new ArrayList<>();
    }
}
