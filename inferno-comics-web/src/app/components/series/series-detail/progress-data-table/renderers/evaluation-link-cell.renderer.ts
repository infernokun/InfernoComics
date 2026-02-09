import { HttpClient } from "@angular/common/http";
import { ICellRendererAngularComp } from "ag-grid-angular";
import { Component } from "@angular/core";
import { EnvironmentService } from "../../../../../services/environment.service";

@Component({
  template: `
    @if (params?.data?.state === "COMPLETED") {
      <button class="eval-btn" (click)="openEvaluationUrl()" title="View Evaluation">
        <svg class="eval-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
          <polyline points="15 3 21 3 21 9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
        <span class="eval-text">View</span>
      </button>
    } @else if (params?.data?.state === "ERROR") {
      <span class="error-badge">Failed</span>
    } @else if (params?.data?.state === "PROCESSING") {
      <span class="processing-badge">
        <span class="pulse-dot"></span>
        Live
      </span>
    }
  `,
  styles: [`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
    }

    .eval-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);
    }

    .eval-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(99, 102, 241, 0.4);
      background: linear-gradient(135deg, #818cf8 0%, #a78bfa 100%);
    }

    .eval-btn:active {
      transform: translateY(0);
      box-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);
    }

    .eval-icon {
      width: 14px;
      height: 14px;
    }

    .eval-text {
      line-height: 1;
    }

    .error-badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 8px;
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }

    .processing-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      background: rgba(99, 102, 241, 0.15);
      color: #6366f1;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }

    .pulse-dot {
      width: 6px;
      height: 6px;
      background: #6366f1;
      border-radius: 50%;
      animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.8); }
    }

    /* Dark theme support */
    :host-context(.dark-theme),
    :host-context([data-theme="dark"]) {
      .eval-btn {
        background: linear-gradient(135deg, #818cf8 0%, #a78bfa 100%);
        box-shadow: 0 2px 4px rgba(129, 140, 248, 0.3);
      }

      .eval-btn:hover {
        background: linear-gradient(135deg, #a5b4fc 0%, #c4b5fd 100%);
        box-shadow: 0 4px 8px rgba(129, 140, 248, 0.4);
      }

      .error-badge {
        background: rgba(239, 68, 68, 0.2);
        color: #fca5a5;
      }

      .processing-badge {
        background: rgba(129, 140, 248, 0.2);
        color: #a5b4fc;
      }

      .pulse-dot {
        background: #a5b4fc;
      }
    }
  `],
})
export class EvaluationLinkCellRenderer implements ICellRendererAngularComp {
  params: any;

  constructor(
    private httpClient: HttpClient,
    private environmentService: EnvironmentService
  ) {}

  agInit(params: any): void {
    this.params = params;
  }

  refresh(): boolean {
    return false;
  }

  async openEvaluationUrl() {
    if (!this.params?.value) {
      console.error('No session ID available');
      return;
    }

    const sessionId = this.params.value;
    try {
      const response = await this.httpClient
        .get<{ evaluationUrl: string }>(
          `${this.environmentService.settings?.restUrl}/progress/evaluation/${sessionId}`
        )
        .toPromise();

      if (!response?.evaluationUrl) {
        console.error('No evaluation URL received from server');
        return;
      }

      const rawUrl = response.evaluationUrl.trim();

      const absoluteUrl = /^https?:\/\//i.test(rawUrl)
        ? rawUrl
        : `${window.location.protocol}//${rawUrl}`;

      const evaluationUrl = new URL(absoluteUrl);

      evaluationUrl.protocol = window.location.protocol;
      evaluationUrl.hostname = window.location.hostname;

      if (this.environmentService.settings?.production) {
        evaluationUrl.port = window.location.port ? window.location.port : '';
      }

      const finalUrl = evaluationUrl.toString();
      console.log('Opening evaluation URL:', finalUrl);
      window.open(finalUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Error fetching evaluation URL:', error);
    }
  }
}
