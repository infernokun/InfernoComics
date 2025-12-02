export class StringUtils {
  static kebabCase(str: string): string {
    return str.toLowerCase().replace(/\s+/g, '-');
  }
}
