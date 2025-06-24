import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'duration',
    standalone: false
})
export class DurationPipe implements PipeTransform {

  transform(totalSeconds: number): string {
    if (totalSeconds == null || isNaN(totalSeconds)) {
      return '';
    }

    let seconds = Math.floor(totalSeconds);

    const years = Math.floor(seconds / (365 * 24 * 3600));
    seconds %= 365 * 24 * 3600;

    const months = Math.floor(seconds / (30 * 24 * 3600));
    seconds %= 30 * 24 * 3600;

    const weeks = Math.floor(seconds / (7 * 24 * 3600));
    seconds %= 7 * 24 * 3600;

    const days = Math.floor(seconds / (24 * 3600));
    seconds %= 24 * 3600;

    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;

    const minutes = Math.floor(seconds / 60);
    seconds %= 60;

    const parts: string[] = [];

    if (years > 0) {
      parts.push(`${years} year${years > 1 ? 's' : ''}`);
    }
    if (months > 0) {
      parts.push(`${months} month${months > 1 ? 's' : ''}`);
    }
    if (weeks > 0) {
      parts.push(`${weeks} week${weeks > 1 ? 's' : ''}`);
    }
    if (days > 0) {
      parts.push(`${days} day${days > 1 ? 's' : ''}`);
    }
    if (hours > 0) {
      parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    }
    if (minutes > 0) {
      parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
    }
    if (seconds > 0 || parts.length === 0) {
      // Show seconds if nonzero or if no other value is available.
      parts.push(`${seconds} second${seconds !== 1 ? 's' : ''}`);
    }

    return parts.join(' ');
  }
}
