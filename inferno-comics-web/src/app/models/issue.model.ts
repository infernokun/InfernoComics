import { Series } from "./series.model";

export enum IssueCondition {
  MINT = 'MINT',
  NEAR_MINT = 'NEAR_MINT',
  VERY_FINE = 'VERY_FINE',
  FINE = 'FINE',
  VERY_GOOD = 'VERY_GOOD',
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  POOR = 'POOR',
}

export interface Issue {
  id?: number;
  issueNumber: string;
  title?: string;
  description?: string;
  coverDate?: Date;
  imageUrl?: string;
  condition?: IssueCondition;
  purchasePrice?: number;
  currentValue?: number;
  purchaseDate?: Date;
  notes?: string;
  comicVineId?: string;
  keyIssue?: boolean;
  variant?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  series?: Series;
  generatedDescription: boolean;
  uploadedImageUrl?: string;
}
