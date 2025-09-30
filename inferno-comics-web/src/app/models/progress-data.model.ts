import { Series } from "./series.model";

export enum ProgressState {
  PROCESSING = 'PROCESSING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR'
}

export enum StartedBy {
  MANUAL = 'MANUAL',
  AUTOMATIC = 'AUTOMATIC'
}

export class ProgressData {
  id?: number;
  state?: ProgressState;
  sessionId?: string;
  timeStarted?: Date;
  timeFinished?: Date;
  series?: Series;
  percentageComplete?: number;
  currentStage?: string;
  statusMessage?: string;
  errorMessage?: string;
  totalItems?: number;
  processedItems?: number;
  successfulItems?: number;
  failedItems?: number;
  lastUpdated?: Date;
  startedBy?: StartedBy;

  constructor(data?: any) {
    if (data) {
      this.id = data.id;
      this.state = data.state as ProgressState;
      this.sessionId = data.sessionId;
      this.timeStarted = data.timeStarted ? this.parseDateTime(data.timeStarted) : undefined;
      this.timeFinished = data.timeFinished ? this.parseDateTime(data.timeFinished) : undefined;
      this.series = new Series(data.series);
      this.percentageComplete = data.percentageComplete ?? 0;
      this.currentStage = data.currentStage;
      this.statusMessage = data.statusMessage;
      this.errorMessage = data.errorMessage;
      this.totalItems = data.totalItems;
      this.processedItems = data.processedItems;
      this.successfulItems = data.successfulItems;
      this.failedItems = data.failedItems;
      this.lastUpdated = data.lastUpdated ? this.parseDateTime(data.lastUpdated) : undefined;
      this.startedBy = data.startedBy as StartedBy;
    }
  }

  /**
   * Parse datetime from Java backend (handles both string and array formats)
   */
  private parseDateTime(dateValue: any): Date | undefined {
    if (!dateValue) return undefined;

    // If it's already a Date object
    if (dateValue instanceof Date) {
      return dateValue;
    }

    // If it's a string (ISO format from Jackson)
    if (typeof dateValue === 'string') {
      return new Date(dateValue);
    }

    // If it's an array format [year, month, day, hour, minute, second]
    if (Array.isArray(dateValue)) {
      // JavaScript months are 0-based, Java months are 1-based
      return new Date(
        dateValue[0], // year
        dateValue[1] - 1, // month (convert from 1-based to 0-based)
        dateValue[2], // day
        dateValue[3] || 0, // hour
        dateValue[4] || 0, // minute
        dateValue[5] || 0, // second
        dateValue[6] ? dateValue[6] / 1000000 : 0 // nanoseconds to milliseconds
      );
    }

    return undefined;
  }

  /**
   * Get duration between start and end times
   */
  getDuration(): number {
    if (!this.timeStarted) return 0;
    
    const startTime = this.timeStarted.getTime();
    const endTime = this.timeFinished ? this.timeFinished.getTime() : Date.now();
    
    return endTime - startTime; // Duration in milliseconds
  }

  /**
   * Get formatted duration string (HH:mm:ss or mm:ss)
   */
  getFormattedDuration(): string {
    const durationMs = this.getDuration();
    const totalSeconds = Math.floor(durationMs / 1000);
    
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Check if the processing session is stale (no updates for 5+ minutes while processing)
   */
  isStale(): boolean {
    if (this.state !== ProgressState.PROCESSING || !this.lastUpdated) {
      return false;
    }

    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000); // 5 minutes in milliseconds
    return this.lastUpdated.getTime() < fiveMinutesAgo;
  }

  /**
   * Get display name for the state
   */
  getStateDisplayName(): string {
    switch (this.state) {
      case ProgressState.PROCESSING:
        return 'Processing';
      case ProgressState.COMPLETE:
        return 'Completed';
      case ProgressState.ERROR:
        return 'Error';
      default:
        return 'Unknown';
    }
  }

  /**
   * Get progress percentage as a number (0-100)
   */
  getProgressPercentage(): number {
    return this.percentageComplete || 0;
  }

  /**
   * Check if processing is currently active
   */
  isActive(): boolean {
    return this.state === ProgressState.PROCESSING;
  }

  /**
   * Check if processing completed successfully
   */
  isCompleted(): boolean {
    return this.state === ProgressState.COMPLETE;
  }

  /**
   * Check if processing failed
   */
  isFailed(): boolean {
    return this.state === ProgressState.ERROR;
  }

  /**
   * Get estimated completion time (if progress is available)
   */
  getEstimatedCompletion(): Date | undefined {
    if (!this.timeStarted || !this.percentageComplete || this.percentageComplete <= 0) {
      return undefined;
    }

    const elapsed = Date.now() - this.timeStarted.getTime();
    const progressRatio = this.percentageComplete / 100;
    const estimatedTotal = elapsed / progressRatio;
    const remaining = estimatedTotal - elapsed;

    return new Date(Date.now() + Math.max(remaining, 0));
  }

  /**
   * Get a user-friendly display name for this processing item
   */
  getDisplayName(): string {
    if (this.currentStage) {
      return this.currentStage;
    }
    
    if (this.statusMessage) {
      return this.statusMessage;
    }
    
    return `Processing Series ${this.series?.id || 'Unknown'}`;
  }

  /**
   * Convert to ProcessingItem format for the processing status icon
   */
  toProcessingItem(): any {
    return {
      id: this.sessionId || this.id?.toString(),
      name: this.getDisplayName(),
      type: 'series-processing',
      status: this.mapToProcessingStatus(),
      progress: this.percentageComplete,
      startTime: this.timeStarted?.toISOString(),
      estimatedCompletion: this.getEstimatedCompletion()?.toISOString()
    };
  }

  /**
   * Map ProgressData state to ProcessingItem status
   */
  private mapToProcessingStatus(): string {
    switch (this.state) {
      case ProgressState.PROCESSING:
        return 'PROCESSING';
      case ProgressState.COMPLETE:
        return 'COMPLETED';
      case ProgressState.ERROR:
        return 'FAILED';
      default:
        return 'QUEUED';
    }
  }
}