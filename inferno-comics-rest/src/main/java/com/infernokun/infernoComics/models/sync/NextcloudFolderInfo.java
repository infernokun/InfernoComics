package com.infernokun.infernoComics.models.sync;

import lombok.*;

import java.time.LocalDateTime;
import java.util.List;

@ToString
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NextcloudFolderInfo {
    private String folderPath;
    private String etag;
    private LocalDateTime lastModified;
    private List<NextcloudFile> files;
    private Long totalSize;
}