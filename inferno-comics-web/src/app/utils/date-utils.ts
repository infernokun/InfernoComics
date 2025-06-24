export class DateUtils {
    /**
     * Format date with time in a readable format
     * @param date The date to format
     * @returns Formatted date string
     */
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
        ((count = 0) => (match: any) => {
          count++;
          return count === 2 ? ' @' : match;
        })()
      );
    }
  }
  