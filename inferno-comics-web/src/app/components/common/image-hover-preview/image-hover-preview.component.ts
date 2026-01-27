
import { Component, Input, ChangeDetectionStrategy, HostListener } from '@angular/core';

@Component({
  selector: 'image-hover-preview',
  template: `
    <div class="preview-wrapper" (mouseenter)="show = true" (mouseleave)="show = false">
      <ng-content></ng-content>
      @if (show) {
        <div class="preview-container">
          <img class="preview-img" [src]="src" [alt]="alt" />
          <img class="match-img" [src]="matchSrc" [alt]="matchAlt" />
        </div>
      }
    </div>
    `,
  styles: [
    `
      .preview-wrapper {
        position: relative;
        display: inline-block;
      }

      .preview-container {
        position: absolute;
        top: 0;
        left: 100%;
        transform: translateX(10px);
        z-index: 100;
        border: 1px solid #ccc;
        background: #fff;
        padding: 4px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        display: flex;
        gap: 8px;
      }

      .preview-img,
      .match-img {
        max-width: 300px;
        max-height: 300px;
      }

      .preview-wrapper.right .preview-container {
        top: 0;
        left: 100%;
        transform: translateX(10px);
      }

      .preview-wrapper.left .preview-container {
        top: 0;
        right: 100%;
        transform: translateX(-10px);
      }

      .preview-wrapper.top .preview-container {
        bottom: 100%;
        left: 50%;
        transform: translate(-50%, -10px);
      }
      
      .preview-wrapper.bottom .preview-container {
        top: 100%;
        left: 50%;
        transform: translate(-50%, 10px);
      }
    `,
  ],
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HoverPreviewComponent {
  @Input() src!: string;
  @Input() alt!: string;
  @Input() matchSrc!: string;
  @Input() matchAlt!: string;
  @Input() position: 'right' | 'left' | 'top' | 'bottom' = 'right';
  show = false;

  ngOnInit() {
    const wrapper = (document.querySelector('image-hover-preview') as HTMLElement);
    wrapper?.classList.add(this.position);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('image-hover-preview')) {
      this.show = false;
    }
  }
}