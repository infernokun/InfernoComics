import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../../material.module';
import { NgApexchartsModule } from 'ng-apexcharts';
import {
  ApexNonAxisChartSeries,
  ApexChart,
  ApexPlotOptions,
} from 'ng-apexcharts';

export interface GaugeMetric {
  icon: string;
  value: string | number;
  label: string;
}

export type RadialChartOptions = {
  series: ApexNonAxisChartSeries;
  chart: ApexChart;
  labels: string[];
  colors: string[];
  plotOptions: ApexPlotOptions;
};

@Component({
  selector: 'app-gauge-stat',
  templateUrl: './gauge-stat.component.html',
  styleUrls: ['./gauge-stat.component.scss'],
  imports: [CommonModule, MaterialModule, NgApexchartsModule],
})
export class GaugeStatComponent {
  @Input() gaugeOptions!: Partial<RadialChartOptions>;
  @Input() metrics: GaugeMetric[] = [];
}
