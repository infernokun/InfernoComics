import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NgApexchartsModule } from 'ng-apexcharts';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';
import { MaterialModule } from '../../../../material.module';
import { CommonModule } from '@angular/common';

export interface CardStatDesign {
  title: string;
  color: string;
  icon: string;
  value: number | string;
}

@Component({
  selector: 'app-card-stat',
  templateUrl: './card-stat.component.html',
  styleUrls: ['./card-stat.component.scss'],
  imports: [
    CommonModule,
    MaterialModule,
    RouterModule,
    NgxSkeletonLoaderModule,
    NgApexchartsModule,
  ]
})
export class CardStatComponent implements OnInit, OnDestroy {
  @Input() stats!: CardStatDesign[];

  ngOnInit(): void { }
  ngOnDestroy(): void { }
}
