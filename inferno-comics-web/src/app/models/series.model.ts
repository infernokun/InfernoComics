import { DateUtils } from "../utils/date-utils";
import { Issue } from "./issue.model";

export class Series {
  id?: number;
  name?: string;
  description?: string;
  publisher?: string;
  startYear?: number;
  endYear?: number;
  imageUrl?: string;
  comicVineId?: string;
  comicVineIds?: string[];
  issueCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
  issues?: Issue[];
  generatedDescription?: boolean;
  gcdIds?: string[];
  lastCachedCovers?: Date;
  cachedCoverUrls?: GCDCover[];

  constructor(data?: any) {
    if (data) {
      this.id = data.id;
      this.name = data.name;
      this.description = data.description;
      this.publisher = data.publisher;
      this.startYear = data.startYear;
      this.endYear = data.endYear;
      this.imageUrl = data.imageUrl;
      this.comicVineId = data.comicVineId;
      this.comicVineIds = data.comicVineIds || [];
      this.issueCount = data.issueCount;
      this.createdAt = data.createdAt ? DateUtils.parseArrayDate(data.createdAt) : undefined;
      this.updatedAt = data.updatedAt ? DateUtils.parseArrayDate(data.updatedAt) : undefined;
      this.issues = data.issues || [];
      this.generatedDescription = data.generatedDescription || false;
      this.gcdIds = data.gcdIds || [];
      this.lastCachedCovers = data.lastCachedCovers ? DateUtils.parseArrayDate(data.lastCachedCovers) : undefined;
      this.cachedCoverUrls = data.cachedCoverUrls || [];
    }
  }
}

// Additional interfaces for dashboard features
export interface PublisherStats {
  name: string;
  seriesCount: number;
  totalIssues: number;
  percentage: number;
  logoUrl?: string;
}

export interface UserPreferences {
  viewMode: 'grid' | 'list';
  favoritePublishers: string[];
}

export interface GCDCover {
    name?: string;
    issueNumber?: string;
    comicVineId?: string;
    urls?: string[];
    error?: string;
    parentComicVineId?: string;
    showAllImages?: boolean;
}