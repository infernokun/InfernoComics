import {
  trigger,
  transition,
  style,
  animate,
  query,
  stagger,
} from '@angular/animations';

export const FADE_ANIMATION = trigger('fadeIn', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(20px)' }),
    animate(
      '500ms ease-out',
      style({ opacity: 1, transform: 'translateY(0)' })
    ),
  ]),
]);

export const TABLE_ANIMATION = trigger('tableRowAnimation', [
  transition('* => *', [
    query(
      ':enter',
      [
        style({ opacity: 0, transform: 'translateY(10px)' }),
        stagger(
          '50ms',
          animate(
            '300ms ease-out',
            style({ opacity: 1, transform: 'translateY(0)' })
          )
        ),
      ],
      { optional: true }
    ),
  ]),
]);
