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

export const CARD_ANIMATION = trigger('cardAnimation', [
  transition(':enter', [
    style({ transform: 'scale(0.95) translateY(20px)', opacity: 0 }),
    animate('350ms ease-out', style({ transform: 'scale(1) translateY(0)', opacity: 1 }))
  ])
]);

export const SLIDE_IN_UP = trigger('slideInUp', [
  transition(':enter', [
    style({ transform: 'translateY(20px)', opacity: 0 }),
    animate('300ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
  ])
]);

export const FADE_IN_UP = trigger('fadeInUp', [
  transition(':enter', [
    style({ transform: 'translateY(30px)', opacity: 0 }),
    animate('400ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
  ])
]);