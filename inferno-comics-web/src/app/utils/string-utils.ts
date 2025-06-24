export class StringUtils {
    /**
     * Convert a string to kebab-case
     * @param str The string to convert
     * @returns Kebab-cased string
     */
    static kebabCase(str: string): string {
      return str.toLowerCase().replace(/\s+/g, '-');
    }
  }
  