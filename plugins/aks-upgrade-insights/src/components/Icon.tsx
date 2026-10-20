import React from 'react';

const paths = {
  layers: 'm12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5',
  shield: 'M12 3 3 6v6c0 5 9 9 9 9s9-4 9-9V6l-9-3Zm-4 9 3 3 5-6',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  back: 'M19 12H5m6-6-6 6 6 6',
  refresh: 'M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M5 15a8 8 0 0 0 13 3',
  search: 'M21 21l-6-6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  close: 'm6 6 12 12M6 18 18 6',
  check: 'm5 12 4 4L19 6',
  alert: 'm12 3 10 18H2L12 3Zm0 6v5m0 3v1',
  clock: 'M12 8v5l3 2m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  code: 'm8 5-7 7 7 7m8-14 7 7-7 7m-3-16-2 20',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-7v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2',
  settings: 'M3 7h18M3 17h18M8 3v8m8 2v8',
  external: 'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7',
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
