// Every custom interactive element replaces the browser's default outline
// with a ring so it stays visible on rounded pills; INSET is used wherever
// the element sits inside an `overflow-hidden` ancestor (a plain ring would
// otherwise get clipped and disappear for keyboard users).
export const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';
export const FOCUS_RING_INSET =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent';
