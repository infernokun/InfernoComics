import { LabTracker } from "./lab-tracker.model";

export class LabActionResult {
  isSuccessful?: boolean;
  labTracker?: LabTracker
  output?: string;
}
