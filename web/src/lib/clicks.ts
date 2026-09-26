import type { MouseEvent } from 'react';

/**
 * Runs `handler` for a single click only. The second click of a double-click (event.detail > 1) is
 * ignored, because by then the button under the pointer may already be the next action
 * (Start trip → Complete trip, Cancel trip → Yes, cancel trip). Keyboard activation (detail 0) still works.
 */
export function singleClick(handler: () => void) {
  return (event: MouseEvent) => {
    if (event.detail > 1) return;
    handler();
  };
}
