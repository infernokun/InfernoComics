import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MaterialModule } from '../../../../material.module';
import { DateUtils } from '../../../../utils/date-utils';

export interface NewestListItem {
  id: number | string;
  imageUrl?: string;
  name: string;
  meta?: string;
  stats?: string;
  link?: string[];
  createdAt?: Date | string | number[];
}

@Component({
  selector: 'app-newest-list',
  templateUrl: './newest-list.component.html',
  styleUrls: ['./newest-list.component.scss'],
  imports: [CommonModule, RouterModule, MaterialModule],
})
export class NewestListComponent {
  @Input() items: NewestListItem[] = [];
  @Input() placeholderIcon = 'library_books';

  parseDateTimeArray = DateUtils.parseDateTimeArray;
  formatDateTime = DateUtils.formatDateTime;

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
}
