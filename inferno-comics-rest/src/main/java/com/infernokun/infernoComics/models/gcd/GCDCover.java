package com.infernokun.infernoComics.models.gcd;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class GCDCover {
    private String issueName;
    private String comicName;
    private List<String> urls = new ArrayList<>();
    private String coverPageUrl;
    private boolean found;
    private String error;
}
