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
    private String name;
    private String issueNumber;
    private String comicVineId;
    private List<String> urls = new ArrayList<>();
    private String error;
    private String parentComicVineId;
}
