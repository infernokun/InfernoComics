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
  comicVineIds?: string[]; // Array of Comic Vine IDs for combined series
  issueCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
  comicBooks?: Issue[];
  generatedDescription: boolean;
}