package com.infernokun.amaterasu.models;

import lombok.Data;

@Data
public class LabActionRequest {
    private String labId;
    private String userId;
    private String teamId;
    private String labTrackerId;
    private String remoteServerId;
}
