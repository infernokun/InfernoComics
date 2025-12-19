import { Series } from "./series.model";

export enum State {
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
  QUEUED = 'QUEUED',
  REPLAYED = 'REPLAYED'
}

export enum StartedBy {
  MANUAL = 'MANUAL',
  AUTOMATIC = 'AUTOMATIC'
}

export class ProgressData {
  id?: number;
  state?: State;
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
      this.state = data.state as State;
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

  private parseDateTime(dateValue: any): Date | undefined {
    if (!dateValue) return undefined;

    if (dateValue instanceof Date) {
      return dateValue;
    }

    if (typeof dateValue === 'string') {
      return new Date(dateValue);
    }

    // If it's an array format [year, month, day, hour, minute, second]
    if (Array.isArray(dateValue)) {
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

  getDurationMs(): number {
    if (!this.timeStarted) return 0;
    
    const startTime = this.timeStarted.getTime();
    const endTime = this.timeFinished ? this.timeFinished.getTime() : Date.now();
    
    return endTime - startTime; // Duration in milliseconds
  }

  getDuration(): string {
    if (!this.timeStarted || !this.timeFinished) {
      return '';
    }

    try {

      if (isNaN(this.timeStarted.getTime()) || isNaN(this.timeFinished.getTime())) {
        return 'Invalid';
      }

      const diffMs = this.timeFinished.getTime() - this.timeStarted.getTime();

      if (diffMs < 0) return 'Invalid';

      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      } else if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
      } else {
        return `${seconds}s`;
      }
    } catch (error) {
      console.error('Error calculating duration:', error);
      return 'Error';
    }
  }

  getFormattedDuration(): string {
    const durationMs = this.getDurationMs();
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

  isStale(): boolean {
    if (this.state !== State.PROCESSING || !this.lastUpdated) {
      return false;
    }

    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000); // 5 minutes in milliseconds
    return this.lastUpdated.getTime() < fiveMinutesAgo;
  }

  getStateDisplayName(): string {
    switch (this.state) {
      case State.PROCESSING:
        return 'Processing';
      case State.COMPLETED:
        return 'Completed';
      case State.ERROR:
        return 'Error';
      default:
        return 'Unknown';
    }
  }

  getProgressPercentage(): number {
    return this.percentageComplete || 0;
  }

  isActive(): boolean {
    return this.state === State.PROCESSING;
  }

  isCompleted(): boolean {
    return this.state === State.COMPLETED;
  }

  isFailed(): boolean {
    return this.state === State.ERROR;
  }

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

  getDisplayName(): string {
    if (this.currentStage) {
      return this.currentStage;
    }
    
    if (this.statusMessage) {
      return this.statusMessage;
    }
    
    return `Processing Series ${this.series?.id || 'Unknown'}`;
  }

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

  private mapToProcessingStatus(): string {
    switch (this.state) {
      case State.PROCESSING:
        return 'PROCESSING';
      case State.COMPLETED:
        return 'COMPLETED';
      case State.ERROR:
        return 'FAILED';
      default:
        return 'QUEUED';
    }
  }
}