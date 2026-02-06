import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, takeUntil, finalize } from 'rxjs';
import { trigger, transition, style, animate, stagger, query } from '@angular/animations';
import { RouterModule } from '@angular/router';
import { MaterialModule } from '../../material.module';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';
import { NgApexchartsModule } from 'ng-apexcharts';
import { ApiResponse } from '../../models/api-response.model';
import { DateUtils } from '../../utils/date-utils';
import {
  StatsService,
  CollectionStats,
  NewestSeriesItem,
  NewestIssueItem,
} from '../../services/stats.service';
import { generateSlug } from '../../models/series.model';
import {
  ApexChart,
  ApexNonAxisChartSeries,
  ApexAxisChartSeries,
  ApexDataLabels,
  ApexPlotOptions,
  ApexLegend,
  ApexXAxis,
  ApexYAxis,
  ApexFill,
  ApexStroke,
  ApexTooltip,
  ApexResponsive,
  ApexGrid,
} from 'ng-apexcharts';
import { NumberStatComponent, NumberStatDesign } from './stat/number-stat/number-stat.component';
import { ChartCardComponent } from './stat/chart-card/chart-card.component';
import { GaugeStatComponent, GaugeMetric } from './stat/gauge-stat/gauge-stat.component';
import { NewestListComponent, NewestListItem } from './stat/newest-list/newest-list.component';

export type DonutChartOptions = {
  series: ApexNonAxisChartSeries;
  chart: ApexChart;
  labels: string[];
  colors: string[];
  plotOptions: ApexPlotOptions;
  dataLabels: ApexDataLabels;
  legend: ApexLegend;
  responsive: ApexResponsive[];
};

export type BarChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
  legend: ApexLegend;
  colors: string[];
  plotOptions: ApexPlotOptions;
  dataLabels: ApexDataLabels;
  grid: ApexGrid;
  tooltip: ApexTooltip;
};

export type RadialChartOptions = {
  series: ApexNonAxisChartSeries;
  chart: ApexChart;
  labels: string[];
  colors: string[];
  plotOptions: ApexPlotOptions;
};

export type AreaChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
  legend: ApexLegend;
  colors: string[];
  fill: ApexFill;
  stroke: ApexStroke;
  dataLabels: ApexDataLabels;
  grid: ApexGrid;
  tooltip: ApexTooltip;
};

@Component({
  selector: 'app-stats',
  templateUrl: './stats.component.html',
  styleUrls: ['./stats.component.scss'],
  imports: [MaterialModule, RouterModule, NgxSkeletonLoaderModule, NgApexchartsModule, NumberStatComponent, ChartCardComponent, GaugeStatComponent, NewestListComponent],
  animations: [
    trigger('fadeInUp', [
      transition(':enter', [
        style({ transform: 'translateY(30px)', opacity: 0 }),
        animate('500ms ease-out', style({ transform: 'translateY(0)', opacity: 1 })),
      ]),
    ]),
    trigger('slideInUp', [
      transition(':enter', [
        style({ transform: 'translateY(20px)', opacity: 0 }),
        animate('400ms ease-out', style({ transform: 'translateY(0)', opacity: 1 })),
      ]),
    ]),
    trigger('staggerCards', [
      transition(':enter', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(20px)' }),
          stagger(80, [
            animate('400ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
          ]),
        ], { optional: true }),
      ]),
    ]),
  ],
})
export class StatsComponent implements OnInit, OnDestroy {
  loading = true;
  stats: CollectionStats | null = null;
  activeTab: 'collection' | 'processing' = 'collection';

  private readonly destroy$ = new Subject<void>();

  formatDateTime = DateUtils.formatDateTime;
  parseDateTimeArray = DateUtils.parseDateTimeArray;

  readonly chartColors = [
    '#3b82f6','#10b981',
    '#f59e0b','#ef4444',
    '#8b5cf6','#ec4899',
    '#14b8a6','#f97316', 
    '#06b6d4','#84cc16',
    '#6366f1','#d946ef',
  ];

  numberStats: NumberStatDesign[] = [];
  processingStats: NumberStatDesign[] = [];

  // Gauge metrics
  collectionHealthMetrics: GaugeMetric[] = [];
  processingSuccessMetrics: GaugeMetric[] = [];
  syncHealthMetrics: GaugeMetric[] = [];

  // Newest items
  newestSeriesItems: NewestListItem[] = [];
  newestIssuesItems: NewestListItem[] = [];

  // Collection charts
  publisherChartOptions!: Partial<DonutChartOptions>;
  issueTypesChartOptions!: Partial<DonutChartOptions>;
  readStatusChartOptions!: Partial<DonutChartOptions>;
  healthGaugeOptions!: Partial<RadialChartOptions>;
  eraChartOptions!: Partial<BarChartOptions>;
  issuesByPublisherOptions!: Partial<BarChartOptions>;
  growthChartOptions!: Partial<AreaChartOptions>;
  topSeriesChartOptions!: Partial<BarChartOptions>;
  mostIncompleteChartOptions!: Partial<BarChartOptions>;

  // Processing/Sync stats charts
  processingStateChartOptions!: Partial<DonutChartOptions>;
  processingSuccessGaugeOptions!: Partial<RadialChartOptions>;
  startedByChartOptions!: Partial<DonutChartOptions>;
  fileStateChartOptions!: Partial<DonutChartOptions>;
  fileSuccessGaugeOptions!: Partial<RadialChartOptions>;
  syncStatusChartOptions!: Partial<DonutChartOptions>;
  syncHealthGaugeOptions!: Partial<RadialChartOptions>;
  processingByMonthChartOptions!: Partial<AreaChartOptions>;
  hasProcessingByMonthData = false;

  constructor(private readonly statsService: StatsService) {}

  ngOnInit(): void {
    this.loadStats();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadStats(): void {
    this.loading = true;
    this.statsService
      .getCollectionStats()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => (this.loading = false))
      )
      .subscribe({
        next: (res: ApiResponse<CollectionStats>) => {
          if (res.data) {
            this.stats = res.data;

            this.numberStats = [
              {
                title: 'Total Series',
                color: 'card-primary',
                icon: 'library_books',
                value: this.stats.overview.totalSeries,
              },
              {
                title: 'Total Issues',
                color: 'card-secondary',
                icon: 'auto_stories',
                value: this.stats.overview.totalIssues,
              },
              {
                title: 'Publishers',
                color: 'card-accent',
                icon: 'business',
                value: this.stats.overview.uniquePublishers,
              },
              {
                title: 'Complete Series',
                color: 'card-info',
                icon: 'verified',
                value: this.stats.completionStats.completedSeries,
              },
              {
                title: 'Variants',
                color: 'card-warning',
                icon: 'style',
                value: this.stats.overview.variantIssues,
              },
              {
                title: 'Missing Issues',
                color: 'card-danger',
                icon: 'search_off',
                value: this.stats.overview.missingIssues,
              },
            ];

            this.processingStats = [
              {
                title: 'Processing Sessions',
                color: 'card-primary',
                icon: 'sync',
                value: this.stats.processingStats.totalSessions,
              },
              {
                title: 'Files Processed',
                color: 'card-secondary',
                icon: 'insert_drive_file',
                value: this.stats.fileStats.totalFiles,
              },
              {
                title: 'Sync Operations',
                color: 'card-accent',
                icon: 'cloud_sync',
                value: this.stats.syncStats.totalSyncs,
              },
              {
                title: 'Avg Duration',
                color: 'card-info',
                icon: 'timer',
                value: this.stats.processingStats.avgDurationFormatted,
              },
              {
                title: 'Total File Size',
                color: 'card-warning',
                icon: 'storage',
                value: this.stats.fileStats.totalFileSizeFormatted,
              },
              {
                title: 'Needs Attention',
                color: 'card-danger',
                icon: 'warning',
                value: this.stats.syncStats.syncsNeedingAttentionCount,
              },
            ];

            // Initialize gauge metrics
            this.collectionHealthMetrics = [
              { icon: 'functions', value: this.getAverageIssuesPerSeries(), label: 'Avg Issues/Series' },
              { icon: 'check_circle', value: this.stats.completionStats.completedSeries, label: 'Complete Series' },
              { icon: 'track_changes', value: this.stats.completionStats.totalTrackedSeries, label: 'Tracked Series' },
            ];

            this.processingSuccessMetrics = [
              { icon: 'check_circle', value: this.stats.processingStats.successfulSessions, label: 'Successful' },
              { icon: 'error', value: this.stats.processingStats.failedSessions, label: 'Failed' },
              { icon: 'inventory_2', value: this.stats.processingStats.totalItemsProcessed, label: 'Items Processed' },
            ];

            this.syncHealthMetrics = [
              { icon: 'folder_copy', value: this.stats.syncStats.uniqueSeriesSynced, label: 'Series Synced' },
              { icon: 'description', value: this.stats.syncStats.totalFilesTracked, label: 'Files Tracked' },
              { icon: 'functions', value: this.stats.syncStats.avgFilesPerSync, label: 'Avg Files/Sync' },
            ];

            // Initialize newest items
            this.newestSeriesItems = (this.stats.newestSeries ?? []).map(series => ({
              id: series.id,
              imageUrl: series.imageUrl,
              name: series.name,
              meta: series.publisher + (series.startYear ? ` \u2022 ${series.startYear}` : ''),
              stats: `${series.issuesOwnedCount} / ${series.issuesAvailableCount} issues`,
              link: this.getSeriesLink(series),
              createdAt: series.createdAt,
            }));

            this.newestIssuesItems = (this.stats.newestIssues ?? []).map(issue => ({
              id: issue.id,
              imageUrl: issue.imageUrl,
              name: issue.seriesName,
              meta: issue.title ? issue.title : `#${issue.issueNumber}`,
              createdAt: issue.createdAt,
            }));

            this.initializeCharts();
          }
        },
        error: (err: Error) => {
          console.error('Error loading collection stats:', err);
        },
      });
  }

  refresh(): void {
    this.loadStats();
  }

  private initializeCharts(): void {
    if (!this.stats) return;

    this.initPublisherChart();
    this.initIssueTypesChart();
    this.initReadStatusChart();
    this.initHealthGauge();
    this.initEraChart();
    this.initIssuesByPublisherChart();
    this.initGrowthChart();
    this.initTopSeriesChart();
    this.initMostIncompleteChart();

    // Processing/Sync stats charts
    this.initProcessingStateChart();
    this.initProcessingSuccessGauge();
    this.initStartedByChart();
    this.initFileStateChart();
    this.initFileSuccessGauge();
    this.initSyncStatusChart();
    this.initSyncHealthGauge();
    this.initProcessingByMonthChart();
  }

  private getBaseDonutOptions(): Partial<DonutChartOptions> {
    return {
      chart: {
        type: 'donut',
        height: 280,
        background: 'transparent',
        animations: {
          enabled: true,
          speed: 800,
        },
      },
      plotOptions: {
        pie: {
          donut: {
            size: '65%',
            labels: {
              show: true,
              name: {
                show: true,
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--text-primary)',
              },
              value: {
                show: true,
                fontSize: '24px',
                fontWeight: 700,
                color: 'var(--text-primary)',
              },
              total: {
                show: true,
                fontSize: '12px',
                color: 'var(--text-muted)',
              },
            },
          },
        },
      },
      dataLabels: {
        enabled: false,
      },
      legend: {
        position: 'right',
        fontSize: '13px',
        labels: {
          colors: 'var(--text-primary)',
        },
        markers: {
          shape: 'circle',
        },
        itemMargin: {
          vertical: 4,
        },
      },
      responsive: [
        {
          breakpoint: 640,
          options: {
            chart: {
              height: 320,
            },
            legend: {
              position: 'bottom',
            },
          },
        },
      ],
    };
  }

  private initPublisherChart(): void {
    const publishers = this.stats?.publisherBreakdown?.slice(0, 8) ?? [];
    const shuffledColors = [...this.chartColors].sort(() => Math.random() - 0.5);
    
    this.publisherChartOptions = {
      ...this.getBaseDonutOptions(),
      series: publishers.map(p => p.seriesCount),
      labels: publishers.map(p => p.name),
      colors: publishers.map((_, index) => shuffledColors[index % shuffledColors.length]),
      plotOptions: {
        ...this.getBaseDonutOptions().plotOptions,
        pie: {
          ...this.getBaseDonutOptions().plotOptions?.pie,
          donut: {
            ...this.getBaseDonutOptions().plotOptions?.pie?.donut,
            labels: {
              ...this.getBaseDonutOptions().plotOptions?.pie?.donut?.labels,
              total: {
                show: true,
                label: 'Publishers',
                formatter: () => String(this.stats?.overview.uniquePublishers ?? 0),
              },
            },
          },
        },
      },
    };
  }

  private initIssueTypesChart(): void {
    const total = this.stats?.overview.totalIssues ?? 0;
    const variant = this.stats?.overview.variantIssues ?? 0;
    const regular = total - variant;
    const labels = ['Regular', 'Variants'];

    this.issueTypesChartOptions = {
      ...this.getBaseDonutOptions(),
      series: [regular, variant],
      labels: labels,
      colors: labels.map(() => {
        const randomIndex = Math.floor(Math.random() * this.chartColors.length);
        return this.chartColors[randomIndex];
      }),
      plotOptions: {
        ...this.getBaseDonutOptions().plotOptions,
        pie: {
          ...this.getBaseDonutOptions().plotOptions?.pie,
          donut: {
            ...this.getBaseDonutOptions().plotOptions?.pie?.donut,
            labels: {
              ...this.getBaseDonutOptions().plotOptions?.pie?.donut?.labels,
              total: {
                show: true,
                label: 'Total',
                formatter: () => String(total),
              },
            },
          },
        },
      },
    };
  }

  private initReadStatusChart(): void {
    const read = this.stats?.readStats.read ?? 0;
    const unread = this.stats?.readStats.unread ?? 0;
    const labels = ['Read', 'Unread'];

    this.readStatusChartOptions = {
      ...this.getBaseDonutOptions(),
      series: [read, unread],
      labels: labels,
      colors: labels.map(() => {
        const randomIndex = Math.floor(Math.random() * this.chartColors.length);
        return this.chartColors[randomIndex];
      }),
      plotOptions: {
        ...this.getBaseDonutOptions().plotOptions,
        pie: {
          ...this.getBaseDonutOptions().plotOptions?.pie,
          donut: {
            ...this.getBaseDonutOptions().plotOptions?.pie?.donut,
            labels: {
              ...this.getBaseDonutOptions().plotOptions?.pie?.donut?.labels,
              total: {
                show: true,
                label: 'Read',
                formatter: () => `${this.stats?.readStats.readPercentage ?? 0}%`,
              },
            },
          },
        },
      },
    };
  }

  private initHealthGauge(): void {
    const completion = this.stats?.completionStats?.averageCompletion ?? 0;

    this.healthGaugeOptions = {
      series: [completion],
      chart: {
        type: 'radialBar',
        height: 200,
        background: 'transparent',
      },
      colors: ['#10b981'],
      plotOptions: {
        radialBar: {
          hollow: {
            size: '60%',
          },
          track: {
            background: 'var(--border-color)',
          },
          dataLabels: {
            name: {
              show: true,
              fontSize: '12px',
              color: 'var(--text-muted)',
              offsetY: 20,
            },
            value: {
              show: true,
              fontSize: '28px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              offsetY: -10,
              formatter: (val: number) => `${val}%`,
            },
          },
        },
      },
      labels: ['Avg Completion'],
    };
  }

  private initEraChart(): void {
    const fiveYearData = this.getFiveYearData();

    this.eraChartOptions = {
      series: [{
        name: 'Series',
        data: fiveYearData.map(d => d.count),
      }],
      chart: {
        type: 'bar',
        height: 250,
        background: 'transparent',
        toolbar: { show: false },
      },
      colors: [...this.chartColors].sort(() => Math.random() - 0.5),
      plotOptions: {
        bar: {
          distributed: true,
          borderRadius: 4,
          columnWidth: '70%',
        },
      },
      dataLabels: {
        enabled: true,
        style: {
          fontSize: '11px',
          fontWeight: 600,
        },
      },
      xaxis: {
        categories: fiveYearData.map(d => d.period),
        labels: {
          style: {
            colors: 'var(--text-secondary)',
            fontSize: '11px',
          },
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        labels: {
          style: {
            colors: 'var(--text-secondary)',
          },
        },
      },
      legend: {
        labels: {
          colors: 'var(--text-primary)'
        }
      },
      grid: {
        borderColor: 'var(--border-color)',
        strokeDashArray: 4,
      },
      tooltip: {
        theme: 'dark',
      },
    };
  }

  private initIssuesByPublisherChart(): void {
    const publishers = this.getTopPublishersByIssues();

    this.issuesByPublisherOptions = {
      series: [{
        name: 'Issues',
        data: publishers.map(p => p.issueCount),
      }],
      chart: {
        type: 'bar',
        height: 280,
        background: 'transparent',
        toolbar: { show: false },
      },
      colors: [...this.chartColors].sort(() => Math.random() - 0.5),
      plotOptions: {
        bar: {
          horizontal: true,
          distributed: true,
          borderRadius: 4,
          barHeight: '70%',
        },
      },
      dataLabels: {
        enabled: true,
        style: {
          fontSize: '12px',
          fontWeight: 600,
        },
      },
      xaxis: {
        categories: publishers.map(p => p.name),
        labels: {
          style: {
            colors: 'var(--text-secondary)',
          },
        },
      },
      yaxis: {
        labels: {
          style: {
            colors: 'var(--text-primary)',
            fontSize: '12px',
          },
        },
      },
      legend: {
        labels: {
          colors: 'var(--text-primary)'
        }
      },
      grid: {
        borderColor: 'var(--border-color)',
        strokeDashArray: 4,
      },
      tooltip: {
        theme: 'dark',
      },
    };
  }

  private initGrowthChart(): void {
    const growthData = this.stats?.collectionGrowth ?? [];
    const shuffledColors = [...this.chartColors].sort(() => Math.random() - 0.5);

    this.growthChartOptions = {
      series: [
        {
          name: 'Total Issues',
          data: growthData.map(d => d.cumulative),
        },
        {
          name: 'Added',
          data: growthData.map(d => d.added),
        },
      ],
      chart: {
        type: 'area',
        height: 300,
        background: 'transparent',
        toolbar: { show: false },
        zoom: { enabled: false },
      },
      colors: [shuffledColors[0], shuffledColors[1]],
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.4,
          opacityTo: 0.1,
          stops: [0, 100],
        },
      },
      stroke: {
        curve: 'smooth',
        width: 2,
      },
      dataLabels: {
        enabled: false,
      },
      xaxis: {
        categories: growthData.map(d => this.formatMonth(d.month)),
        labels: {
          style: {
            colors: 'var(--text-secondary)',
            fontSize: '11px',
          },
          rotate: -45,
          rotateAlways: growthData.length > 8,
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        labels: {
          style: {
            colors: 'var(--text-secondary)',
          },
        },
      },
      legend: {
        labels: {
          colors: 'var(--text-primary)'
        }
      },
      grid: {
        borderColor: 'var(--border-color)',
        strokeDashArray: 4,
      },
      tooltip: {
        theme: 'dark',
        x: {
          show: true,
        },
      },
    };
  }

  private initTopSeriesChart(): void {
    const series = this.stats?.topSeriesByIssueCount ?? [];
    const shuffledColors = [...this.chartColors].sort(() => Math.random() - 0.5);

    this.topSeriesChartOptions = {
      series: [{
        name: 'Issues',
        data: series.map(s => s.count),
      }],
      chart: {
        type: 'bar',
        height: 280,
        background: 'transparent',
        toolbar: { show: false },
      },
      colors: series.map(s => 
        s.count < 20 ? shuffledColors[0] : 
        s.count <= 30 ? shuffledColors[1] : 
        s.count <= 40 ? shuffledColors[2] : 
        s.count <= 50 ? shuffledColors[3] : 
        shuffledColors[4]
      ),
      plotOptions: {
        bar: {
          horizontal: true,
          distributed: true,
          borderRadius: 4,
          barHeight: '70%',
        },
      },
      dataLabels: {
        enabled: true,
        style: {
          fontSize: '12px',
          fontWeight: 600,
        },
      },
      xaxis: {
        categories: series.map(s => s.name),
        labels: {
          style: {
            colors: 'var(--text-secondary)',
          },
        },
      },
      yaxis: {
        labels: {
          style: {
            colors: 'var(--text-primary)',
            fontSize: '12px',
          },
          maxWidth: 150,
        },
      },
      legend: {
        labels: {
          colors: 'var(--text-primary)'
        }
      },
      grid: {
        borderColor: 'var(--border-color)',
        strokeDashArray: 4,
      },
      tooltip: {
        theme: 'dark',
      },
    };
  }

  private initMostIncompleteChart(): void {
    // Show series with lowest completion % (most missing relative to available)
    const leastComplete = this.stats?.completionStats?.leastCompleteSeriesCompletion ?? [];

    // Calculate missing count for each (already sorted by backend)
    const missingData = leastComplete.slice(0, 8).map(s => ({
      name: s.name,
      missing: s.available - s.owned,
      percentage: s.percentage,
    }));

    const shuffledColors = [...this.chartColors].sort(() => Math.random() - 0.5);

    this.mostIncompleteChartOptions = {
      series: [{
        name: 'Missing',
        data: missingData.map(s => s.missing),
      }],
      chart: {
        type: 'bar',
        height: 280,
        background: 'transparent',
        toolbar: { show: false },
      },
      colors: missingData.map(s => 
        s.missing < 5 ? shuffledColors[0] : 
        s.missing <= 10 ? shuffledColors[1] : 
        s.missing <= 15 ? shuffledColors[2] : 
        s.missing <= 20 ? shuffledColors[3] : 
        shuffledColors[4]
      ),
      plotOptions: {
        bar: {
          horizontal: true,
          distributed: true,
          borderRadius: 4,
          barHeight: '70%',
        },
      },
      dataLabels: {
        enabled: true,
        formatter: (val: number) => `${val}`,
        style: {
          fontSize: '12px',
          fontWeight: 600,
        },
      },
      xaxis: {
        categories: missingData.map(s => s.name),
        labels: {
          style: {
            colors: 'var(--text-secondary)',
          },
        },
      },
      yaxis: {
        labels: {
          style: {
            colors: 'var(--text-primary)',
            fontSize: '12px',
          },
          maxWidth: 150,
        },
      },
      legend: {
        labels: {
          colors: 'var(--text-primary)'
        }
      },
      grid: {
        borderColor: 'var(--border-color)',
        strokeDashArray: 4,
      },
      tooltip: {
        theme: 'dark',
        y: {
          formatter: (val: number, opts: { dataPointIndex: number }) => {
            const item = missingData[opts.dataPointIndex];
            return `${val} missing (${item.percentage}% complete)`;
          },
        },
      },
    };
  }

  // ========================================
  // Processing Stats Charts
  // ========================================

  private initProcessingStateChart(): void {
    const stateData = this.stats?.processingStats?.stateDistribution ?? {};
    const labels = Object.keys(stateData);
    const series = Object.values(stateData);
    const shuffledColors = [...this.chartColors].sort(() => Math.random() - 0.5);

    this.processingStateChartOptions = {
      ...this.getBaseDonutOptions(),
      series: series,
      labels: labels.map(l => this.formatStateLabel(l)),
      colors: labels.map((_, index) => shuffledColors[index % shuffledColors.length]),
      plotOptions: {
        ...this.getBaseDonutOptions().plotOptions,
        pie: {
          ...this.getBaseDonutOptions().plotOptions?.pie,
          donut: {
            ...this.getBaseDonutOptions().plotOptions?.pie?.donut,
            labels: {
              ...this.getBaseDonutOptions().plotOptions?.pie?.donut?.labels,
              total: {
                show: true,
                label: 'Sessions',
                formatter: () => String(this.stats?.processingStats?.totalSessions ?? 0),
              },
            },
          },
        },
      },
    };
  }

  private initProcessingSuccessGauge(): void {
    const successRate = this.stats?.processingStats?.successRate ?? 0;

    this.processingSuccessGaugeOptions = {
      series: [successRate],
      chart: {
        type: 'radialBar',
        height: 200,
        background: 'transparent',
      },
      colors: [successRate >= 80 ? '#10b981' : successRate >= 50 ? '#f59e0b' : '#ef4444'],
      plotOptions: {
        radialBar: {
          hollow: {
            size: '60%',
          },
          track: {
            background: 'var(--border-color)',
          },
          dataLabels: {
            name: {
              show: true,
              fontSize: '12px',
              color: 'var(--text-muted)',
              offsetY: 20,
            },
            value: {
              show: true,
              fontSize: '28px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              offsetY: -10,
              formatter: (val: number) => `${val}%`,
            },
          },
        },
      },
      labels: ['Success Rate'],
    };
  }

  private initStartedByChart(): void {
    const startedByData = this.stats?.processingStats?.startedByDistribution ?? {};
    const labels = Object.keys(startedByData);
    const series = Object.values(startedByData);
    const shuffledColors = [...this.chartColors].sort(() => Math.random() - 0.5);

    this.startedByChartOptions = {
      ...this.getBaseDonutOptions(),
      series: series,
      labels: labels.map(l => this.formatStateLabel(l)),
      colors: labels.map((_, index) => shuffledColors[index % shuffledColors.length]),
      plotOptions: {
        ...this.getBaseDonutOptions().plotOptions,
        pie: {
          ...this.getBaseDonutOptions().plotOptions?.pie,
          donut: {
            ...this.getBaseDonutOptions().plotOptions?.pie?.donut,
            labels: {
              ...this.getBaseDonutOptions().plotOptions?.pie?.donut?.labels,
              total: {
                show: true,
                label: 'Total',
                formatter: () => String(series.reduce((a, b) => a + b, 0)),
              },
            },
          },
        },
      },
    };
  }

  private initFileStateChart(): void {
    const stateData = this.stats?.fileStats?.stateDistribution ?? {};
    const labels = Object.keys(stateData);
    const series = Object.values(stateData);
    const shuffledColors = [...this.chartColors].sort(() => Math.random() - 0.5);
    

    this.fileStateChartOptions = {
      ...this.getBaseDonutOptions(),
      series: series,
      labels: labels.map(l => this.formatStateLabel(l)),
      colors: labels.map((_, index) => shuffledColors[index % shuffledColors.length]),
      plotOptions: {
        ...this.getBaseDonutOptions().plotOptions,
        pie: {
          ...this.getBaseDonutOptions().plotOptions?.pie,
          donut: {
            ...this.getBaseDonutOptions().plotOptions?.pie?.donut,
            labels: {
              ...this.getBaseDonutOptions().plotOptions?.pie?.donut?.labels,
              total: {
                show: true,
                label: 'Files',
                formatter: () => String(this.stats?.fileStats?.totalFiles ?? 0),
              },
            },
          },
        },
      },
    };
  }

  private initFileSuccessGauge(): void {
    const successRate = this.stats?.fileStats?.fileSuccessRate ?? 0;

    this.fileSuccessGaugeOptions = {
      series: [successRate],
      chart: {
        type: 'radialBar',
        height: 200,
        background: 'transparent',
      },
      colors: [successRate >= 80 ? '#10b981' : successRate >= 50 ? '#f59e0b' : '#ef4444'],
      plotOptions: {
        radialBar: {
          hollow: {
            size: '60%',
          },
          track: {
            background: 'var(--border-color)',
          },
          dataLabels: {
            name: {
              show: true,
              fontSize: '12px',
              color: 'var(--text-muted)',
              offsetY: 20,
            },
            value: {
              show: true,
              fontSize: '28px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              offsetY: -10,
              formatter: (val: number) => `${val}%`,
            },
          },
        },
      },
      labels: ['File Success'],
    };
  }

  private initSyncStatusChart(): void {
    const statusData = this.stats?.syncStats?.statusDistribution ?? {};
    const labels = Object.keys(statusData);
    const series = Object.values(statusData);
    const shuffledColors = [...this.chartColors].sort(() => Math.random() - 0.5);

    this.syncStatusChartOptions = {
      ...this.getBaseDonutOptions(),
      series: series,
      labels: labels.map(l => this.formatStateLabel(l)),
      colors: labels.map((_, index) => shuffledColors[index % shuffledColors.length]),
      plotOptions: {
        ...this.getBaseDonutOptions().plotOptions,
        pie: {
          ...this.getBaseDonutOptions().plotOptions?.pie,
          donut: {
            ...this.getBaseDonutOptions().plotOptions?.pie?.donut,
            labels: {
              ...this.getBaseDonutOptions().plotOptions?.pie?.donut?.labels,
              total: {
                show: true,
                label: 'Syncs',
                formatter: () => String(this.stats?.syncStats?.totalSyncs ?? 0),
              },
            },
          },
        },
      },
    };
  }

  private initSyncHealthGauge(): void {
    const healthRate = this.stats?.syncStats?.syncHealthRate ?? 0;

    this.syncHealthGaugeOptions = {
      series: [healthRate],
      chart: {
        type: 'radialBar',
        height: 200,
        background: 'transparent',
      },
      colors: [healthRate >= 80 ? '#10b981' : healthRate >= 50 ? '#f59e0b' : '#ef4444'],
      plotOptions: {
        radialBar: {
          hollow: {
            size: '60%',
          },
          track: {
            background: 'var(--border-color)',
          },
          dataLabels: {
            name: {
              show: true,
              fontSize: '12px',
              color: 'var(--text-muted)',
              offsetY: 20,
            },
            value: {
              show: true,
              fontSize: '28px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              offsetY: -10,
              formatter: (val: number) => `${val}%`,
            },
          },
        },
      },
      labels: ['Sync Health'],
    };
  }

  private initProcessingByMonthChart(): void {
    const monthData = this.stats?.processingStats?.processingByMonth ?? {};
    const months = Object.keys(monthData).sort();
    const counts = months.map(m => monthData[m] || 0);

    // Check if we have actual data (more than 1 month with data)
    this.hasProcessingByMonthData = months.length > 1;

    // Calculate cumulative totals
    let cumulative = 0;
    const cumulativeCounts = counts.map(c => {
      cumulative += c;
      return cumulative;
    });

    this.processingByMonthChartOptions = {
      series: [
        {
          name: 'Total Sessions',
          data: cumulativeCounts,
        },
        {
          name: 'Sessions',
          data: counts,
        },
      ],
      chart: {
        type: 'area',
        height: 300,
        background: 'transparent',
        toolbar: { show: false },
        zoom: { enabled: false },
      },
      colors: ['#8b5cf6', '#10b981'],
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.4,
          opacityTo: 0.1,
          stops: [0, 100],
        },
      },
      stroke: {
        curve: 'smooth',
        width: 2,
      },
      dataLabels: {
        enabled: false,
      },
      xaxis: {
        categories: months.map(m => this.formatMonth(m)),
        labels: {
          style: {
            colors: 'var(--text-secondary)',
            fontSize: '11px',
          },
          rotate: -45,
          rotateAlways: months.length > 8,
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        labels: {
          style: {
            colors: 'var(--text-secondary)',
          },
        },
      },
      legend: {
        show: false,
        labels: {
          colors: 'var(--text-primary)'
        }
      },
      grid: {
        borderColor: 'var(--border-color)',
        strokeDashArray: 4,
      },
      tooltip: {
        theme: 'dark',
        x: {
          show: true,
        },
      },
    };
  }

  private formatStateLabel(state: string): string {
    // Handle enum format like "Completed(Displayname=Completed)" -> "Completed"
    // Extract the displayname value if present
    const displayNameMatch = state.match(/\(Displayname=([^)]+)\)/i);
    if (displayNameMatch) {
      state = displayNameMatch[1];
    }

    // Handle format like "MyEnum.Enum(Value=COMPLETED)" -> "Completed"
    const valueMatch = state.match(/\(Value=([^)]+)\)/i);
    if (valueMatch) {
      state = valueMatch[1];
    }

    // Handle format like "EnumName.VALUE" -> "Value"
    const dotMatch = state.match(/\.([^.]+)$/);
    if (dotMatch) {
      state = dotMatch[1];
    }

    // Remove any remaining parenthetical content
    state = state.replace(/\([^)]*\)/g, '').trim();

    return state
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  // Helper methods for data processing
  private getFiveYearData(): { period: string; count: number; percentage: number }[] {
    if (!this.stats?.decadeBreakdown) return [];

    const fiveYearData: Record<string, number> = {};

    Object.entries(this.stats.decadeBreakdown).forEach(([decade, count]) => {
      const match = decade.match(/(\d{4})/);
      if (match) {
        const startYear = parseInt(match[1], 10);
        const firstHalf = Math.ceil(count / 2);
        const secondHalf = count - firstHalf;

        const firstPeriod = `${startYear}-${String(startYear + 4).slice(2)}`;
        const secondPeriod = `${startYear + 5}-${String(startYear + 9).slice(2)}`;

        fiveYearData[firstPeriod] = (fiveYearData[firstPeriod] || 0) + firstHalf;
        fiveYearData[secondPeriod] = (fiveYearData[secondPeriod] || 0) + secondHalf;
      } else {
        fiveYearData[decade] = count;
      }
    });

    const entries = Object.entries(fiveYearData).sort(([a], [b]) => a.localeCompare(b));
    const maxCount = Math.max(...entries.map(([, c]) => c));

    return entries.map(([period, count]) => ({
      period,
      count,
      percentage: maxCount > 0 ? (count / maxCount) * 100 : 0,
    }));
  }

  private getTopPublishersByIssues(): { name: string; issueCount: number; percentage: number }[] {
    if (!this.stats?.publisherBreakdown?.length) return [];

    const sorted = [...this.stats.publisherBreakdown].sort((a, b) => b.issueCount - a.issueCount);
    const top = sorted.slice(0, 8);
    const maxCount = top.length ? Math.max(...top.map(p => p.issueCount)) : 1;

    return top.map(pub => ({
      name: pub.name,
      issueCount: pub.issueCount,
      percentage: maxCount > 0 ? (pub.issueCount / maxCount) * 100 : 0,
    }));
  }

  formatMonth(month: string): string {
    const [year, m] = month.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(m, 10) - 1]} '${year.slice(2)}`;
  }

  getAverageIssuesPerSeries(): string {
    if (!this.stats?.overview) return '0';
    const { totalIssues, totalSeries } = this.stats.overview;
    if (totalSeries === 0) return '0';
    return (totalIssues / totalSeries).toFixed(1);
  }

  getNewestSeries(): NewestSeriesItem[] {
    return this.stats?.newestSeries ?? [];
  }

  getNewestIssues(): NewestIssueItem[] {
    return this.stats?.newestIssues ?? [];
  }

  getRelativeTime(date: Date | string | number[] | undefined): string {
    if (!date) return '';

    let parsedDate: Date;
    if (Array.isArray(date)) {
      parsedDate = this.parseDateTimeArray(date);
    } else if (date instanceof Date) {
      parsedDate = date;
    } else {
      parsedDate = new Date(date);
    }

    if (isNaN(parsedDate.getTime())) return '';

    const now = new Date();
    const diffMs = now.getTime() - parsedDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return this.formatDateTime(parsedDate);
  }

  getSeriesLink(series: NewestSeriesItem): string[] {
    return ['/series', String(series.id), generateSlug(series.name)];
  }
}
