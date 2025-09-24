package com.infernokun.infernoComics.models.sync;

import lombok.*;

import java.time.LocalDateTime;

@Data
@Builder
@ToString
@NoArgsConstructor
@AllArgsConstructor
public class NextcloudFile {
    private String name;
    private String path;
    private String etag;
    private Long size;
    private LocalDateTime lastModified;
    private String contentType;
    private boolean directory;
}