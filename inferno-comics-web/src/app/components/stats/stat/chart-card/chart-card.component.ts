import { Component, Input } from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../../material.module';

@Component({
  selector: 'app-chart-card',
  templateUrl: './chart-card.component.html',
  styleUrls: ['./chart-card.component.scss'],
  imports: [CommonModule, MaterialModule],
  animations: [
    trigger('fadeInUp', [
      transition(':enter', [
        style({ transform: 'translateY(30px)', opacity: 0 }),
        animate(
          '500ms ease-out',
          style({ transform: 'translateY(0)', opacity: 1 })
        ),
      ]),
    ]),
  ],
})
export class ChartCardComponent {
  @Input() icon!: string;
  @Input() title!: string;
  @Input() subtitle?: string;
  @Input() badge?: string;
  @Input() fullWidth = false;
  @Input() hasData = true;
  @Input() noDataMessage = 'No data available';
}
