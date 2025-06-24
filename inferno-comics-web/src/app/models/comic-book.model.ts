import { Series } from "./series.model";

export enum ComicBookCondition {
  MINT = 'MINT',
  NEAR_MINT = 'NEAR_MINT',
  VERY_FINE = 'VERY_FINE',
  FINE = 'FINE',
  VERY_GOOD = 'VERY_GOOD',
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  POOR = 'POOR',
}

export interface ComicBook {
  id?: number;
  issueNumber: string;
  title?: string;
  description?: string;
  coverDate?: Date;
  imageUrl?: string;
  condition?: ComicBookCondition;
  purchasePrice?: number;
  currentValue?: number;
  purchaseDate?: Date;
  notes?: string;
  comicVineId?: string;
  isKeyIssue?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  series?: Series;
}
