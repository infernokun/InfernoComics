import { Component } from "@angular/core";
import { ICellRendererAngularComp } from "ag-grid-angular";
import { State } from "../../../../../models/progress-data.model";
import { upperLower } from "../../../../../utils/utils";

@Component({
  selector: 'app-combined-status-renderer',
  template: `
    <div class="combined-status-container">
      <!-- Main status with icon -->
      <div class="main-status">
        <span class="status-icon" [style.color]="getStatusColor()">{{
          getStatusIcon()
        }}</span>
        <span class="status-text" [style.color]="getStatusColor()">{{
          getMainStatusText()
        }}</span>
        <span>{{ params?.data?.startedBy }} @if (params.data.state === State.COMPLETED) {}</span>
      </div>

      <!-- Progress bar for processing items -->
      @if (shouldShowProgress()) {
      <div class="progress-section">
        <div class="progress-bar" [class.progress-processing]="isProcessing()">
          <div class="progress-fill" [style.width.%]="getPercentage()"></div>
          <div class="progress-text">{{ getPercentage() }}%</div>
        </div>
      </div>
      }

      <!-- Status message (smaller font) -->
      @if (params?.data?.statusMessage) {
      <div class="status-message">
        {{ params.data.statusMessage }}
      </div>
      }
    </div>
  `,
  styles: [
    `
      .combined-status-container {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 4px 0;
        min-height: 40px;
        justify-content: center;
      }

      .main-status {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
        font-size: 0.9em;
      }

      .status-icon {
        font-size: 1.1em;
      }

      .status-text {
        font-weight: 600;
      }

      .progress-section {
        margin: 2px 0;
      }

      .progress-bar {
        width: 100%;
        height: 16px;
        background-color: #e9ecef;
        border-radius: 8px;
        overflow: hidden;
        position: relative;
      }

      .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #28a745 0%, #20c997 100%);
        border-radius: 8px;
        transition: width 0.3s ease;
        position: relative;
      }

      .progress-text {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 10px;
        font-weight: 600;
        color: #fff;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        z-index: 2;
      }

      .progress-processing .progress-fill {
        animation: progress-pulse 2s infinite;
      }

      @keyframes progress-pulse {
        0% {
          opacity: 0.6;
        }
        50% {
          opacity: 1;
        }
        100% {
          opacity: 0.6;
        }
      }

      .status-message {
        font-size: 0.75em;
        color: #6c757d;
        font-style: italic;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        line-height: 1.2;
      }
    `,
  ],
  imports: [],
})
export class CombinedStatusCellRenderer implements ICellRendererAngularComp {
  params: any;

  State = State;

  constructor() {}

  agInit(params: any): void {
    this.params = params;
  }

  refresh(): boolean {
    return false;
  }

  getStatusIcon(): string {
    const state: State = this.params?.data?.state;
    const icons: Record<State, string> = {
      COMPLETED: '✅',
      PROCESSING: '⏳',
      ERROR: '❌',
      REPLAYED: '🔁',
      QUEUED: '⏳',
    };
    return icons[state] || '❓';
  }

  getStatusColor(): string {
    const state: State = this.params?.data?.state;
    const colors: Record<State, string> = {
      COMPLETED: '#28a745',
      PROCESSING: '#ffc107',
      ERROR: '#dc3545',
      REPLAYED: '#6c757d',
      QUEUED: '#17a2b8',
    };
    return colors[state] || '#6c757d';
  }

  getMainStatusText(): string {
    const state: State = this.params?.data?.state;

    switch (state) {
      case State.COMPLETED:
        return upperLower(State.COMPLETED);
      case State.PROCESSING:
        return upperLower(State.PROCESSING);;
      case State.ERROR:
        return upperLower(State.ERROR);;
      case State.QUEUED:
        return upperLower(State.QUEUED);;
    case State.REPLAYED:
        return upperLower(State.REPLAYED);;
      default:
        return state || State.ERROR;
    }
  }

  shouldShowProgress(): boolean {
    const state = this.params?.data?.state;
    const percentage = this.getPercentage();

    // Show progress bar if processing or if we have meaningful progress data (but not complete)
    return (
      state === State.PROCESSING ||
      (percentage > 0 && percentage < 100 && state !== State.COMPLETED)
    );
  }

  isProcessing(): boolean {
    return this.params?.data?.state === State.PROCESSING;
  }

  getPercentage(): number {
    return this.params?.data?.percentageComplete || 0;
  }
}
