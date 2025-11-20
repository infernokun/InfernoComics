package com.infernokun.infernoComics.services.sync;

import com.infernokun.infernoComics.models.ProgressData;
import com.infernokun.infernoComics.models.sync.ProcessedFile;
import com.infernokun.infernoComics.repositories.ProgressDataRepository;
import com.infernokun.infernoComics.repositories.sync.ProcessedFileRepository;
import com.infernokun.infernoComics.services.ProgressService;
import com.infernokun.infernoComics.websocket.InfernoComicsSocketHandler;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class WeirdService {
    private final ProgressService progressService;
    private final InfernoComicsSocketHandler websocket;
    private final ProcessedFileRepository processedFileRepository;
    private final ProgressDataRepository progressDataRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void saveProcessedFiles(List<ProcessedFile> filesToRecord) {
        processedFileRepository.saveAll(filesToRecord);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void deleteProcessedFile(ProcessedFile file) {
        processedFileRepository.delete(file);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void saveProgressData(ProgressData data) {
        progressDataRepository.save(data);
        websocket.broadcastObjUpdate(progressService.getSessionsByRelevance());
    }
}
