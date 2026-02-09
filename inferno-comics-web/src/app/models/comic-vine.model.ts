export interface ComicVineSeries {
  id: string;
  name: string;
  description?: string;
  publisher?: string;
  startYear?: number;
  endYear?: number;
  comicVineId?: string;
  comicVineIds?: string[];
  issueCount?: number;
  imageUrl?: string;
  generatedDescription?: boolean;
}

export interface VariantCover {
  id: string;
  originalUrl: string;
  caption?: string;
  imageTags?: string;
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
  variants?: VariantCover[];
}

export interface ComicVineSeriesDto {
  id: string;
  name: string;
  description: string;
  issueCount: number;
  publisher: string;
  startYear: number;
  endYear: number;
  imageUrl: string;
  generatedDescription: boolean;
}

export interface ComicVineIssueDto {
  id: string;
  issueNumber: string;
  name: string;
  description: string;
  coverDate: string;
  imageUrl: string;
}
