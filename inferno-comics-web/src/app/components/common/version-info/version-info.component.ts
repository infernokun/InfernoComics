import { Component, OnInit } from '@angular/core';
import { VersionService } from '../../../services/version.service';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../material.module';

@Component({
  selector: 'app-version-info',
  template: `<mat-icon matTooltip="{{ tooltip }}" aria-label="App versions">info</mat-icon>`,
  imports: [CommonModule, MaterialModule]
})
export class VersionInfoComponent implements OnInit {
  tooltip = 'Loading…';

  constructor(private vs: VersionService) {}

  ngOnInit() {
    this.vs.getAllVersions().subscribe(({ web, backend }) => {
      this.tooltip = [
        `${web.name}: ${web.version}`,
        `${backend.rest.name}: ${backend.rest.version}`,
        `${backend.recog.name}: ${backend.recog.version}`
      ].join('\n');
    });
  }
}