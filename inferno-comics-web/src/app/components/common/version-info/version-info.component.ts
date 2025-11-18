import { Component, Input, OnInit } from '@angular/core';
import { VersionService } from '../../../services/version.service';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../material.module';
import { WebsocketService } from '../../../services/websocket.service';

@Component({
  selector: 'app-version-info',
  template: `
    <div class="version-info-container" 
         (mouseenter)="showPanel = true" 
         (mouseleave)="showPanel = false">
      <mat-icon class="info-icon" [ngClass]="{ connected: webSocketConnected }">info</mat-icon>
      
      <div class="version-panel" *ngIf="showPanel">
        <div class="panel-header">
          <mat-icon>info_outline</mat-icon>
          <span>Version Information ({{webSocketConnected ? 'connected' : 'disconnected'}})</span>
        </div>
        
        <div class="panel-content" *ngIf="versions; else loading">
          <div class="version-item">
            <span class="label">Web</span>
            <span class="version">{{ versions.web.version }}</span>
          </div>
          <div class="version-item">
            <span class="label">REST API</span>
            <span class="version">{{ versions.backend.rest.version }}</span>
          </div>
          <div class="version-item">
            <span class="label">Recognition</span>
            <span class="version">{{ versions.backend.recog.version }}</span>
          </div>
        </div>
        
        <ng-template #loading>
          <div class="loading">
            <mat-spinner diameter="24"></mat-spinner>
            <span>Loading versions...</span>
          </div>
        </ng-template>
      </div>
    </div>
  `,
  styles: [`
    .version-info-container {
      position: relative;
      display: inline-flex;
      align-items: center;
    }

    .info-icon {
      font-size: 20px;
      width: 24px;
      height: 24px;
      cursor: pointer;
      transition: color 0.2s ease;
      color: #dc3545;

      &.connected {
        color: #28a745;
  }   
    }

    .info-icon:hover {
      color: rgba(0, 0, 0, 0.87);
    }

    .version-panel {
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-top: 8px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      min-width: 250px;
      z-index: 1000;
      overflow: hidden;
    }

    .panel-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      font-weight: 500;
      font-size: 14px;
    }

    .panel-header mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .panel-content {
      padding: 16px;
    }

    .version-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid #f0f0f0;
    }

    .version-item:last-child {
      border-bottom: none;
    }

    .label {
      font-size: 13px;
      color: #666;
      font-weight: 500;
    }

    .version {
      font-family: 'Roboto Mono', monospace;
      font-size: 13px;
      color: #333;
      background: #f5f5f5;
      padding: 4px 8px;
      border-radius: 4px;
      font-weight: 600;
    }

    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 24px 16px;
      color: #666;
      font-size: 13px;
    }
  `],
  standalone: true,
  imports: [CommonModule, MaterialModule]
})
export class VersionInfoComponent implements OnInit {
  showPanel = false;
  versions: any = null;

  @Input() webSocketConnected: boolean = true;
  
  constructor(private vs: VersionService, private websocket: WebsocketService) {}
  
  ngOnInit() {
    this.vs.getAllVersions().subscribe(data => {
      this.versions = data;
    });
  }
}