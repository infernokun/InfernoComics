import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'bashColoring',
    standalone: false
})
export class BashColoringPipe implements PipeTransform {

  transform(value: string, applyColor: boolean): string {
    if (!applyColor) {
      return value;
    }

    // Simple example: Add colors using bash-like ANSI escape codes
    let coloredOutput = value;

    // Apply color for specific text (e.g., error messages in red)
    coloredOutput = coloredOutput.replace(/(ERROR)/gi, '\x1b[31m$1\x1b[0m');  // Red for ERROR
    coloredOutput = coloredOutput.replace(/(SUCCESS)/gi, '\x1b[32m$1\x1b[0m');  // Green for SUCCESS
    coloredOutput = coloredOutput.replace(/(WARNING)/gi, '\x1b[33m$1\x1b[0m');  // Yellow for WARNING

    return coloredOutput;
  }
}
