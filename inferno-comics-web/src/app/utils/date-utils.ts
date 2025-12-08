export class DateUtils {
  static formatDateTime(date: Date | null | undefined, seconds: boolean = false): string {
    if (!date) return '';

    let options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    };

    if (seconds) options.second = '2-digit'

    return date.toLocaleString('en-US', options);
  }

  static formatDate(date: Date | null | undefined): string {
    if (!date) return '';

    const options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    };

    return date.toLocaleString('en-US', options);
  }

  static parseDateTimeArray(dateArray: number[]): Date {
    if (!Array.isArray(dateArray) || dateArray.length < 6) {
      return new Date(); // fallback to current date
    }

    const [year, month, day, hour, minute, second, nanoseconds = 0] = dateArray;
    // Note: JavaScript Date months are 0-indexed, so subtract 1 from month
    return new Date(
      year,
      month - 1,
      day,
      hour,
      minute,
      second,
      Math.floor(nanoseconds / 1000000)
    );
  }

  static parseDateArray(dateArray: number[]): Date {
    if (!Array.isArray(dateArray) || dateArray.length < 2) {
      return new Date();
    }

    const [year, month, day] = dateArray;
    // Note: JavaScript Date months are 0-indexed, so subtract 1 from month
    return new Date(
      year,
      month - 1,
      day,
    );
  }
}
