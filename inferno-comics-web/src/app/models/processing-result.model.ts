export class ProcessingResult {
    hasNewFiles?: boolean;
    totalFiles?: number;
    newFilesCount?: number;
    processedCount?: number;
    failedCount?: number;
    sessionId?: string;
    errorMessage?: string;
  
    constructor(data?: any) {
      if (data) {
        this.hasNewFiles = data.hasNewFiles;
        this.totalFiles = data.totalFiles;
        this.newFilesCount = data.newFilesCount;
        this.processedCount = data.processedCount;
        this.failedCount = data.failedCount;
        this.sessionId = data.sessionId
        this.errorMessage = data.errorMessage;
      }
    }
}