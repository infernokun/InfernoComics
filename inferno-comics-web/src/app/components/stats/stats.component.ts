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
  imports: [MaterialModule, RouterModule, NgxSkeletonLoaderModule, NgApexchartsModule],
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

  private readonly destroy$ = new Subject<void>();

  formatDateTime = DateUtils.formatDateTime;
  parseDateTimeArray = DateUtils.parseDateTimeArray;

  readonly chartColors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16',
    '#6366f1', '#d946ef',
  ];

  // Collection charts
  publisherChartOptions!: Partial<DonutChartOptions>;
  issueTypesChartOptions!: Partial<DonutChartOptions>;
  readStatusChartOptions!: Partial<DonutChartOptions>;
  healthGaugeOptions!: Partial<RadialChartOptions>;
  eraChartOptions!: Partial<BarChartOptions>;
  issuesByPublisherOptions!: Partial<BarChartOptions>;
  growthChartOptions!: Partial<AreaChartOptions>;
  topSeriesChartOptions!: Partial<BarChartOptions>;
  completionChartOptions!: Partial<BarChartOptions>;

  // Processing/Sync stats charts
  processingStateChartOptions!: Partial<DonutChartOptions>;
  processingSuccessGaugeOptions!: Partial<RadialChartOptions>;
  startedByChartOptions!: Partial<DonutChartOptions>;
  fileStateChartOptions!: Partial<DonutChartOptions>;
  fileSuccessGaugeOptions!: Partial<RadialChartOptions>;
  syncStatusChartOptions!: Partial<DonutChartOptions>;
  syncHealthGaugeOptions!: Partial<RadialChartOptions>;
  processingByDayChartOptions!: Partial<BarChartOptions>;

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
    this.initCompletionChart();

    // Processing/Sync stats charts
    this.initProcessingStateChart();
    this.initProcessingSuccessGauge();
    this.initStartedByChart();
    this.initFileStateChart();
    this.initFileSuccessGauge();
    this.initSyncStatusChart();
    this.initSyncHealthGauge();
    this.initProcessingByDayChart();
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
    this.publisherChartOptions = {
      ...this.getBaseDonutOptions(),
      series: publishers.map(p => p.seriesCount),
      labels: publishers.map(p => p.name),
      colors: this.chartColors.slice(0, publishers.length),
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

    this.issueTypesChartOptions = {
      ...this.getBaseDonutOptions(),
      series: [regular, variant],
      labels: ['Regular', 'Variants'],
      colors: ['#3b82f6', '#8b5cf6'],
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

    this.readStatusChartOptions = {
      ...this.getBaseDonutOptions(),
      series: [read, unread],
      labels: ['Read', 'Unread'],
      colors: ['#10b981', '#6b7280'],
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
      colors: this.chartColors,
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
      colors: this.chartColors,
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
      colors: ['#3b82f6', '#10b981'],
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
      colors: this.chartColors,
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
      grid: {
        borderColor: 'var(--border-color)',
        strokeDashArray: 4,
      },
      tooltip: {
        theme: 'dark',
      },
    };
  }

  private initCompletionChart(): void {
    const completion = this.stats?.completionStats?.topSeriesCompletion ?? [];

    this.completionChartOptions = {
      series: [{
        name: 'Completion',
        data: completion.map(s => s.percentage),
      }],
      chart: {
        type: 'bar',
        height: 280,
        background: 'transparent',
        toolbar: { show: false },
      },
      colors: completion.map(s => s.percentage >= 100 ? '#10b981' : '#3b82f6'),
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
        formatter: (val: number) => `${val}%`,
        style: {
          fontSize: '12px',
          fontWeight: 600,
        },
      },
      xaxis: {
        categories: completion.map(s => s.name),
        max: 100,
        labels: {
          style: {
            colors: 'var(--text-secondary)',
          },
          formatter: (val: string) => `${val}%`,
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
      grid: {
        borderColor: 'var(--border-color)',
        strokeDashArray: 4,
      },
      tooltip: {
        theme: 'dark',
        y: {
          formatter: (val: number) => `${val}%`,
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

    const stateColors: Record<string, string> = {
      'COMPLETED': '#10b981',
      'PROCESSING': '#3b82f6',
      'ERROR': '#ef4444',
      'PENDING': '#f59e0b',
      'CANCELLED': '#6b7280',
    };

    this.processingStateChartOptions = {
      ...this.getBaseDonutOptions(),
      series: series,
      labels: labels.map(l => this.formatStateLabel(l)),
      colors: labels.map(l => stateColors[l] || '#6b7280'),
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

    this.startedByChartOptions = {
      ...this.getBaseDonutOptions(),
      series: series,
      labels: labels.map(l => this.formatStateLabel(l)),
      colors: ['#3b82f6', '#8b5cf6'],
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

    const stateColors: Record<string, string> = {
      'COMPLETED': '#10b981',
      'PROCESSING': '#3b82f6',
      'ERROR': '#ef4444',
      'PENDING': '#f59e0b',
    };

    this.fileStateChartOptions = {
      ...this.getBaseDonutOptions(),
      series: series,
      labels: labels.map(l => this.formatStateLabel(l)),
      colors: labels.map(l => stateColors[l] || '#6b7280'),
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

    const statusColors: Record<string, string> = {
      'COMPLETED': '#10b981',
      'IN_PROGRESS': '#3b82f6',
      'FAILED': '#ef4444',
      'PENDING': '#f59e0b',
      'EMPTY': '#6b7280',
    };

    this.syncStatusChartOptions = {
      ...this.getBaseDonutOptions(),
      series: series,
      labels: labels.map(l => this.formatStateLabel(l)),
      colors: labels.map(l => statusColors[l] || '#6b7280'),
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

  private initProcessingByDayChart(): void {
    const dayData = this.stats?.processingStats?.processingByDayOfWeek ?? {};
    const daysOrder = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
    const shortDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const sortedData = daysOrder.map((day, i) => ({
      day: shortDays[i],
      count: dayData[day] || 0,
    }));

    this.processingByDayChartOptions = {
      series: [{
        name: 'Sessions',
        data: sortedData.map(d => d.count),
      }],
      chart: {
        type: 'bar',
        height: 200,
        background: 'transparent',
        toolbar: { show: false },
      },
      colors: this.chartColors,
      plotOptions: {
        bar: {
          distributed: true,
          borderRadius: 4,
          columnWidth: '60%',
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
        categories: sortedData.map(d => d.day),
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
      grid: {
        borderColor: 'var(--border-color)',
        strokeDashArray: 4,
      },
      tooltip: {
        theme: 'dark',
      },
    };
  }

  private formatStateLabel(state: string): string {
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
