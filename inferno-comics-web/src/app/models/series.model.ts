import { Issue } from "./issue.model";

export interface Series {
  id?: number;
  name: string;
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
  comicBooks?: Issue[];
  generatedDescription: boolean;
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