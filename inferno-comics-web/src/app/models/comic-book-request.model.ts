import { ComicBookCondition } from "./comic-book.model";

export interface ComicBookRequest {
  seriesId: number;
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
}
