export class DateUtils {
  static formatDateWithTime(date: Date | null | undefined): string {
    if (!date) return '';

    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    };

    return date.toLocaleString('en-US', options).replace(
      /,/g,
      (
        (count = 0) =>
        (match: any) => {
          count++;
          return count === 2 ? ' @' : match;
        }
      )()
    );
  }

  static parseArrayDate(dateArray: number[]): Date {
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
}
