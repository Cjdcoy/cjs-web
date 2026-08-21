export const cjsBreakpoints = {
  compact: 360,
  medium: 768,
  wide: 1440,
} as const;

export type CjsBreakpoint = keyof typeof cjsBreakpoints;
