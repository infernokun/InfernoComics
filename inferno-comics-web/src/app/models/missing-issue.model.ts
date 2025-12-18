import { DateUtils } from "../utils/date-utils";
import { Series } from "./series.model";

export class MissingIssue {
  id?: number;
  series?: Series;
  seriesId?: number;
  issueNumber?: string;
  imageUrl?: string;
  expectedIssueName?: string;
  expectedCoverDate?: Date;
  createdAt?: Date;
  lastChecked?: Date;

    constructor(data?: any) {
        if (data) {
            this.id = data.id;
            this.series = new Series(data.series);
            this.issueNumber = data.issueNumber;
            this.imageUrl = data.imageUrl;
            this.expectedIssueName = data.expectedIssueName;
            this.expectedCoverDate = data.expectedCoverDate ? DateUtils.parseDateArray(data.expectedCoverDate) : undefined;
            this.createdAt = data.createdAt ? DateUtils.parseDateTimeArray(data.createdAt) : undefined;
            this.lastChecked = data.lastChecked ? DateUtils.parseDateTimeArray(data.lastChecked) : undefined;
        }
    }
}