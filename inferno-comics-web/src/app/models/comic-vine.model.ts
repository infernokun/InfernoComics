export interface ComicVineSeries {
  id: string;
  name: string;
  description?: string;
  publisher?: string;
  startYear?: number;
  endYear?: number;
  comicVineId?: string; // For backwards compatibility
  comicVineIds?: string[]; // Array of Comic Vine IDs for combined series
  issueCount?: number;
  imageUrl?: string;
  generatedDescription: boolean;
}

export interface ComicVineIssue {
  id: string;
  issueNumber: string;
  name?: string;
  description?: string;
  coverDate?: string;
  imageUrl?: string;
  generatedDescription: boolean;
  keyIssue?: boolean;
  variant?: boolean;
}
