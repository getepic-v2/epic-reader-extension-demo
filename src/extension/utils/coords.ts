/**
 * Coordinate transforms for reading-area interaction layers.
 *
 * Star/region coordinates from the XML are single-page relative (0-100% of one
 * page). The reading-area slot spans a full 2-page spread, so coordinates on
 * the right page must be remapped into the right half. Ported from epic-labs
 * EpicLabsComponent.dfX/dfW/hsX/hsW.
 */

/** drag-fill x: right-direction items sit in the right half of the spread. */
export function dfX(x: number, direction: 'left' | 'right'): number {
  return direction === 'right' ? x / 2 + 50 : x
}

/** drag-fill width: spread is 2x a single page, so halve single-page widths. */
export function dfW(w: number): number {
  return w / 2
}

/** hotspot x: map single-page x to full-spread based on which page it's on. */
export function hsX(x: number, direction: 'left' | 'right'): number {
  return direction === 'right' ? x / 2 + 50 : x / 2
}

/** hotspot width: single-page width → full-spread width. */
export function hsW(w: number): number {
  return w / 2
}
