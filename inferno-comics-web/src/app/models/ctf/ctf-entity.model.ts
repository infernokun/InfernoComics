import { DifficultyLevel } from "../../enums/difficulty-level.enum";
import { StoredObject } from "../stored-object.model";
import { Flag } from "./flag.model";
import { Hint } from "./hint.model";

export class CTFEntity extends StoredObject {
  // excluded from dto
  flags?: Flag[];
  // included in dto
  question?: string;
  maxAttempts?: number;
  description?: string;
  category?: string;
  difficultyLevel?: DifficultyLevel;
  points?: number;
  author?: string;
  hints?: Hint[];
  tags?: string[];
  visible?: boolean;
  isActive?: boolean;
  solveCount?: number;
  attemptCount?: number;
  releaseDate?: Date;
  expirationDate?: Date;
  attachments?: string[];
  solutionExplanation?: string;
  relatedChallengeIds?: string[];

  constructor(serverResult?: any) {
    super(serverResult);

    if (serverResult) {
      this.question = serverResult.question;
      this.maxAttempts = serverResult.maxAttempts;
      this.description = serverResult.description;
      this.hints = serverResult.hints;
      this.category = serverResult.category;
      this.difficultyLevel = serverResult.difficultyLevel;
      this.points = serverResult.points;
      this.author = serverResult.author;
      this.flags = serverResult.flags;
      this.tags = serverResult.tags;
      this.visible = serverResult.visible;
      this.isActive = serverResult.isActive;
      this.solveCount = serverResult.solveCount;
      this.attemptCount = serverResult.attemptCount;
      this.releaseDate = serverResult.releaseDate ? new Date(serverResult.releaseDate) : undefined;
      this.expirationDate = serverResult.expirationDate ? new Date(serverResult.expirationDate) : undefined;
      this.attachments = serverResult.attachment;
      this.solutionExplanation = serverResult.solutionExplanation;
      this.relatedChallengeIds = serverResult.relatedChallengeIds;
    }
  }
}