import { ComicBook } from "./comic-book.model";

export interface Series {
  id?: number;
  name: string;
  description?: string;
  publisher?: string;
  startYear?: number;
  endYear?: number;
  imageUrl?: string;
  comicVineId?: string;
  createdAt?: Date;
  updatedAt?: Date;
  comicBooks?: ComicBook[];
  generatedDescription: boolean;
}