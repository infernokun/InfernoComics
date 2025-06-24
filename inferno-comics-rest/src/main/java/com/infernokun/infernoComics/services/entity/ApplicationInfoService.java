package com.infernokun.amaterasu.services.entity;

import com.infernokun.amaterasu.models.entities.ApplicationInfo;
import com.infernokun.amaterasu.repositories.ApplicationInfoRepository;
import com.infernokun.amaterasu.services.BaseService;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class ApplicationInfoService extends BaseService {
    private final ApplicationInfoRepository applicationInfoRepository;

    public ApplicationInfoService(ApplicationInfoRepository applicationInfoRepository) {
        this.applicationInfoRepository = applicationInfoRepository;
    }

    public ApplicationInfo getApplicationInfo() {
        List<ApplicationInfo> appInfo = applicationInfoRepository.findAll();
        return appInfo.size() == 1 ? appInfo.getFirst() : null;
    }

    public ApplicationInfo createApplicationInfo(ApplicationInfo applicationInfo) {
        if (getApplicationInfo() != null) throw new RuntimeException("Application info can only be defined once.");

        return applicationInfoRepository.save(applicationInfo);
    }

    public ApplicationInfo updateApplicationInfo(ApplicationInfo applicationInfo) {
        applicationInfo.setUpdatedAt(LocalDateTime.now());
        return applicationInfoRepository.save(applicationInfo);
    }
}
