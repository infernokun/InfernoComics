package com.infernokun.amaterasu.models.entities.alt;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;

@Data
@Slf4j
public class VolumeChangeRequest {
    private String serviceName;
    private int index;
    private String targetPath;
    private boolean directory;
    private String fileName;
}
