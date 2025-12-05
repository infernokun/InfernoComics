import { DateUtils } from "../utils/date-utils";
import { Series } from "./series.model";

export interface VariantCover {
  id?: string;
  originalUrl?: string;
  caption?: string;
  imageTags?: string;
}

export interface IssueRequest {
  seriesId: number;
  issueNumber: string;
  title?: string;
  description?: string;
  coverDate?: Date;
  imageUrl?: string;
  uploadedImageUrl?: string;
  condition?: IssueCondition;
  purchasePrice?: number;
  currentValue?: number;
  purchaseDate?: Date;
  notes?: string;
  comicVineId?: string;
  keyIssue?: boolean;
  variant?: boolean; 
  generatedDescription: boolean;
}

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

export class Issue {
  id?: number;
  issueNumber?: string;
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
  generatedDescription?: boolean;
  uploadedImageUrl?: string;
  gcdIds?: string[];
  variantCovers?: VariantCover[];

  constructor(data?: any) {
    if (data) {
      this.id = data.id;
      this.issueNumber = data.issueNumber;
      this.title = data.title;
      this.description = data.description;
      this.coverDate = data.coverDate ? DateUtils.parseDateArray(data.coverDate) : undefined;
      this.imageUrl = data.imageUrl;
      this.condition = data.condition;
      this.purchasePrice = data.purchasePrice || 0;
      this.currentValue = data.currentValue || 0;
      this.purchaseDate = data.purchaseDate ? DateUtils.parseDateArray(data.purchaseDate) : undefined;
      this.notes = data.notes;
      this.comicVineId = data.comicVineId;
      this.keyIssue = data.keyIssue || false;
      this.variant = data.variant || false;
      this.createdAt = data.createdAt ? DateUtils.parseDateTimeArray(data.createdAt) : undefined;
      this.updatedAt = data.updatedAt ? DateUtils.parseDateTimeArray(data.updatedAt) : undefined;
      this.series = data.series ? new Series(data.series) : undefined;
      this.generatedDescription = data.generatedDescription || false;
      this.uploadedImageUrl = data.uploadedImageUrl;
      this.gcdIds = data.gcdIds || [];
      this.variantCovers = data.variantCovers || [];
    }
  }
}
