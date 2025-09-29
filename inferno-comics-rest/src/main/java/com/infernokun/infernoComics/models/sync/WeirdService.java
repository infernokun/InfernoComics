package com.infernokun.infernoComics.models.sync;

import com.infernokun.infernoComics.repositories.sync.ProcessedFileRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class WeirdService {

    private final ProcessedFileRepository processedFileRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void saveProcessedFiles(List<ProcessedFile> filesToRecord) {
        processedFileRepository.saveAll(filesToRecord);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void deleteProcessedFile(ProcessedFile file) {
        processedFileRepository.delete(file);
    }
}
