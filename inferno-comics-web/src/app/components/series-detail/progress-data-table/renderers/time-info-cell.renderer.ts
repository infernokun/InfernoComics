import { Component } from "@angular/core";
import { ICellRendererAngularComp } from "ag-grid-angular";
import { ProgressData, State } from "../../../../models/progress-data.model";

@Component({
  selector: 'app-time-info-renderer',
  template: `
    <div class="time-info-container">
      <div class="time-row started">
        <span class="time-label">Started:</span>
        <span class="time-value">{{
          formatTime(params?.data?.timeStarted)
        }}</span>
      </div>
      @if (params?.data?.timeFinished) {
      <div class="time-row finished">
        <span class="time-label">Finished:</span>
        <span class="time-value">{{
          formatTime(params?.data?.timeFinished)
        }}</span>
      </div>
      } @if (params.data.getDuration()) {
      <div class="time-row duration">
        <span class="time-label">Duration:</span>
        <span class="time-value duration-text">{{ params.data.getDuration() }}</span>
      </div>
      } @if (!params?.data?.timeFinished) {
      <div class="time-row processing">
        <span class="time-value processing-text">{{
          getProcessingStatus()
        }}</span>
      </div>
      }
    </div>
  `,
  styles: [
    `
      .time-info-container {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 4px 0;
        font-size: 0.8em;
        line-height: 1.2;
      }

      .time-row {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .time-label {
        font-weight: 500;
        color: #6c757d;
        min-width: 50px;
        font-size: 0.85em;
      }

      .time-value {
        color: #495057;
        font-weight: 400;
      }

      .duration-text {
        color: #007bff;
        font-weight: 600;
      }

      .processing-text {
        color: #ffc107;
        font-style: italic;
        font-weight: 500;
      }

      .started .time-value {
        color: #28a745;
      }

      .finished .time-value {
        color: #17a2b8;
      }
    `,
  ],
  imports: [],
})
export class TimeInfoCellRenderer implements ICellRendererAngularComp {
  params: any;

  agInit(params: any): void {
    this.params = params;
    this.params.data = new ProgressData(this.params.data);
  }

  refresh(): boolean {
    return false;
  }

  formatTime(timeString: string): string {
    if (!timeString) return 'N/A';

    try {
      const date = new Date(timeString);
      if (isNaN(date.getTime())) {
        return 'Invalid';
      }

      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch (error) {
      console.error('Error formatting time:', error);
      return 'Invalid';
    }
  }

  getProcessingStatus(): string {
    const state: State = this.params?.data?.state;
    if (state === State.PROCESSING) {
      return 'Currently processing...';
    } else if (state === State.ERROR) {
      return 'Failed to complete';
    } else {
      return 'Not finished';
    }
  }
}
