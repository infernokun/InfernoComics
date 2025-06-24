package com.infernokun.amaterasu.controllers.entity;

import com.infernokun.amaterasu.controllers.BaseController;
import com.infernokun.amaterasu.models.ApiResponse;
import com.infernokun.amaterasu.models.entities.ApplicationInfo;
import com.infernokun.amaterasu.services.entity.ApplicationInfoService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/application-info")
public class ApplicationInfoController extends BaseController {
    private final ApplicationInfoService applicationInfoService;

    @GetMapping
    @PreAuthorize("permitAll()")
    public ResponseEntity<ApiResponse<ApplicationInfo>> getApplicationInfo() {
        ApplicationInfo applicationInfo = applicationInfoService.getApplicationInfo();
        return ResponseEntity.ok(
                ApiResponse.<ApplicationInfo>builder()
                        .code(HttpStatus.OK.value())
                        .message("Application Info retrieved!")
                        .data(applicationInfo)
                        .build()
        );
    }

    @PostMapping
    @PreAuthorize("permitAll()")
    public ResponseEntity<ApiResponse<ApplicationInfo>> createApplicationInfo(@RequestBody ApplicationInfo applicationInfo) {
        return ResponseEntity.ok(
                ApiResponse.<ApplicationInfo>builder()
                        .code(HttpStatus.OK.value())
                        .message("Application Info retrieved!")
                        .data(applicationInfoService.createApplicationInfo(applicationInfo))
                        .build()
        );
    }
}
