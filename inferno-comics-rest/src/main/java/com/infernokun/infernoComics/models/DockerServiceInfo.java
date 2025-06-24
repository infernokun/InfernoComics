package com.infernokun.amaterasu.models;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.*;

import java.util.*;

@Data
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class DockerServiceInfo {
    private String name;
    private String state;
    private List<String> ports = new ArrayList<>();
    private List<Map<String, String>> volumes = new ArrayList<>();
    private List<String> ipAddresses = new ArrayList<>();
    private List<String> networks = new ArrayList<>();

    public String toJsonString() throws JsonProcessingException {
        ObjectMapper objectMapper = new ObjectMapper();
        return objectMapper.writeValueAsString(this);
    }
}
