package com.infernokun.amaterasu.models;

import com.infernokun.amaterasu.models.entities.lab.LabTracker;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LabActionResult {
    private boolean isSuccessful;
    private LabTracker labTracker;
    private String output;
}
