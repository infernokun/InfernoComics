import { HttpClient } from "@angular/common/http";
import { ICellRendererAngularComp } from "ag-grid-angular";
import { Component } from "@angular/core";
import { EnvironmentService } from "../../../../../services/environment.service";

@Component({
  template: `
    @if (params?.data?.state === "COMPLETE") {
    <a
      (click)="openEvaluationUrl()"
      style="cursor: pointer; color: blue; text-decoration: underline;"
    >
      Evaluation
    </a>
    }
  `,
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
