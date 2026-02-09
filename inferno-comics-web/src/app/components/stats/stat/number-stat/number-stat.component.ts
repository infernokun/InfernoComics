import {
  trigger,
  transition,
  style,
  animate,
  query,
  stagger,
} from '@angular/animations';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NgApexchartsModule } from 'ng-apexcharts';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';
import { MaterialModule } from '../../../../material.module';
import { CommonModule } from '@angular/common';

export interface NumberStatDesign {
  title: string;
  color: string;
  icon: string;
  value: number | string;
}

@Component({
  selector: 'app-number-stat',
  templateUrl: './number-stat.component.html',
  styleUrls: ['./number-stat.component.scss'],
  imports: [
    CommonModule,
    MaterialModule,
    RouterModule,
    NgxSkeletonLoaderModule,
    NgApexchartsModule,
  ],
  animations: [
    trigger('fadeInUp', [
      transition(':enter', [
        style({ transform: 'translateY(30px)', opacity: 0 }),
        animate(
          '500ms ease-out',
          style({ transform: 'translateY(0)', opacity: 1 }),
        ),
      ]),
    ]),
    trigger('slideInUp', [
      transition(':enter', [
        style({ transform: 'translateY(20px)', opacity: 0 }),
        animate(
          '400ms ease-out',
          style({ transform: 'translateY(0)', opacity: 1 }),
        ),
      ]),
    ]),
    trigger('staggerCards', [
      transition(':enter', [
        query(
          ':enter',
          [
            style({ opacity: 0, transform: 'translateY(20px)' }),
            stagger(80, [
              animate(
                '400ms ease-out',
                style({ opacity: 1, transform: 'translateY(0)' }),
              ),
            ]),
          ],
          { optional: true },
        ),
      ]),
    ]),
  ],
})
export class NumberStatComponent implements OnInit, OnDestroy {
  @Input() stats!: NumberStatDesign[];

  ngOnInit(): void { }
  ngOnDestroy(): void { }

  get hasData(): boolean {
    return this.stats && this.stats.length > 0;
  }
}
