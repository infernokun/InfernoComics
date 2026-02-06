import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
import { EnvironmentService } from './environment.service';
import { BaseService } from './base.service';

export interface CollectionStats {
  overview: CollectionOverview;
  publisherBreakdown: PublisherBreakdownItem[];
  decadeBreakdown: Record<string, number>;
  conditionBreakdown: Record<string, number>;
  topSeriesByIssueCount: SeriesIssueCount[];
  collectionGrowth: GrowthPoint[];
  completionStats: CompletionStats;
  valueAnalysis: ValueAnalysis;
  newestSeries: NewestSeriesItem[];
  newestIssues: NewestIssueItem[];
  readStats: ReadStats;
  processingStats: ProcessingStats;
  fileStats: FileStats;
  syncStats: SyncStats;
}

export interface CollectionOverview {
  totalSeries: number;
  totalIssues: number;
  keyIssues: number;
  variantIssues: number;
  uniquePublishers: number;
  missingIssues: number;
  totalCurrentValue: number;
  totalPurchaseValue: number;
}

export interface PublisherBreakdownItem {
  name: string;
  seriesCount: number;
  issueCount: number;
  percentage: number;
}

export interface SeriesIssueCount {
  name: string;
  count: number;
}

export interface GrowthPoint {
  month: string;
  added: number;
  cumulative: number;
}

export interface CompletionStats {
  completedSeries: number;
  totalTrackedSeries: number;
  averageCompletion: number;
  topSeriesCompletion: SeriesCompletionItem[];
  leastCompleteSeriesCompletion: SeriesCompletionItem[];
}

export interface SeriesCompletionItem {
  name: string;
  owned: number;
  available: number;
  percentage: number;
}

export interface ValueAnalysis {
  totalCurrentValue: number;
  totalPurchaseValue: number;
  profitLoss: number;
  averageIssueValue: number;
  issuesWithValue: number;
  highestValueIssue?: HighestValueIssue;
}

export interface HighestValueIssue {
  id: number;
  issueNumber: string;
  title: string;
  seriesName: string;
  currentValue: number;
}

export interface NewestSeriesItem {
  id: number;
  name: string;
  publisher: string;
  startYear: number;
  imageUrl: string;
  issuesOwnedCount: number;
  issuesAvailableCount: number;
  createdAt: Date;
}

export interface NewestIssueItem {
  id: number;
  issueNumber: string;
  title: string;
  seriesName: string;
  imageUrl: string;
  condition: string;
  currentValue: number;
  createdAt: Date;
}

export interface ReadStats {
  read: number;
  unread: number;
  readPercentage: number;
}

// Processing Stats (from ProgressData)
export interface ProcessingStats {
  totalSessions: number;
  stateDistribution: Record<string, number>;
  startedByDistribution: Record<string, number>;
  avgDurationSeconds: number;
  avgDurationFormatted: string;
  successRate: number;
  successfulSessions: number;
  failedSessions: number;
  totalItemsProcessed: number;
  avgItemsPerSession: number;
  processingByDayOfWeek: Record<string, number>;
  processingByMonth?: Record<string, number>;
  recentSessions: RecentProcessingSession[];
}

export interface RecentProcessingSession {
  sessionId: string;
  seriesName: string;
  state: string;
  startedBy: string;
  duration: string;
  totalItems: number;
  processedItems: number;
  successfulItems: number;
  failedItems: number;
  timeStarted: Date;
  timeFinished: Date;
}

// File Stats (from ProcessedFile)
export interface FileStats {
  totalFiles: number;
  stateDistribution: Record<string, number>;
  totalFileSize: number;
  totalFileSizeFormatted: string;
  avgFileSize: number;
  avgFileSizeFormatted: string;
  filesPerDay: Record<string, number>;
  fileSuccessRate: number;
  filesPerSeriesCount: number;
}

// Sync Stats (from SeriesSyncStatus)
export interface SyncStats {
  totalSyncs: number;
  statusDistribution: Record<string, number>;
  totalFilesTracked: number;
  avgFilesPerSync: number;
  syncHealthRate: number;
  uniqueSeriesSynced: number;
  recentSyncs: RecentSync[];
  syncsNeedingAttention: SyncNeedingAttention[];
  syncsNeedingAttentionCount: number;
}

export interface RecentSync {
  id: number;
  seriesId: number;
  folderPath: string;
  syncStatus: string;
  totalFilesCount: number;
  lastSyncTimestamp: Date;
  errorMessage: string;
}

export interface SyncNeedingAttention {
  id: number;
  seriesId: number;
  syncStatus: string;
  errorMessage: string;
  updatedAt: Date;
}

@Injectable({
  providedIn: 'root',
})
export class StatsService extends BaseService {
  private apiUrl: string = '';

  constructor(
    protected override http: HttpClient,
    private environmentService: EnvironmentService
  ) {
    super(http);
    this.apiUrl = `${this.environmentService.settings?.restUrl}/stats`;
  }

  getCollectionStats(): Observable<ApiResponse<CollectionStats>> {
    return this.get<ApiResponse<CollectionStats>>(`${this.apiUrl}/collection`);
  }
}
