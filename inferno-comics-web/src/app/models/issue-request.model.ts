import { IssueCondition } from "./issue.model";

export interface IssueRequest {
  seriesId: number;
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
  generatedDescription: boolean;
}
