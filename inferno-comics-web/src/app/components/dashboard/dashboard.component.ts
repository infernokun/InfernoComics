import { Component, OnInit } from '@angular/core';
import { SeriesService } from '../../services/series.service';
import { IssueService } from '../../services/issue.service';
import { Series } from '../../models/series.model';
import { Issue } from '../../models/issue.model';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  standalone: false
})
export class DashboardComponent implements OnInit {
  totalSeries = 0;
  totalIssues = 0;
  keyIssues: Issue[] = [];
  recentSeries: Series[] = [];
  loading = true;

  constructor(
    private seriesService: SeriesService,
    private issueService: IssueService
  ) {}

  ngOnInit(): void {
    this.loadDashboardData();
  }

  loadDashboardData(): void {
    this.loading = true;

    // Load all series
    this.seriesService.getAllSeries().subscribe({
      next: (series) => {
        this.totalSeries = series.length;
        this.recentSeries = series.slice(0, 6);
      },
      error: (error) => console.error('Error loading series:', error)
    });

    // Load all comic books
    this.issueService.getAllIssues().subscribe({
      next: (issues) => {
        this.totalIssues = issues.length;
      },
      error: (error) => console.error('Error loading comic books:', error)
    });

    // Load key issues
    this.issueService.getKeyIssues().subscribe({
      next: (keyIssues) => {
        this.keyIssues = keyIssues.slice(0, 6);
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading key issues:', error);
        this.loading = false;
      }
    });
  }
}