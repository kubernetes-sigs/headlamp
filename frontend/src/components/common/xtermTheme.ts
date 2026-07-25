/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { Theme } from '@mui/material/styles';
import { darken, getContrastRatio, getLuminance, lighten } from '@mui/material/styles';
import type { ITheme } from '@xterm/xterm';

/** Reference ANSI palette tuned for *dark* terminal backgrounds. */
const DARK_BG_ANSI = {
  black: '#000000',
  red: '#ff6e67',
  green: '#5af78e',
  yellow: '#f3f99d',
  blue: '#57c7ff',
  magenta: '#ff77ff',
  cyan: '#9aedfe',
  white: '#eff0eb',
  brightBlack: '#686868',
  brightRed: '#ff5c57',
  brightGreen: '#5af78e',
  brightYellow: '#f3f99d',
  brightBlue: '#57c7ff',
  brightMagenta: '#ff6ac1',
  brightCyan: '#9aedfe',
  brightWhite: '#ffffff',
} as const;

/** Reference ANSI palette tuned for *light* terminal backgrounds. */
const LIGHT_BG_ANSI = {
  black: '#2e3436',
  red: '#cc0000',
  green: '#4e9a06',
  yellow: '#c4a000',
  blue: '#3465a4',
  magenta: '#75507b',
  cyan: '#06989a',
  // Traditional ANSI 37 "white" is a light gray; on a light background we keep
  // it as a darker gray so program output that uses it stays visible.
  white: '#888a85',
  brightBlack: '#555753',
  brightRed: '#ef2929',
  brightGreen: '#73d216',
  brightYellow: '#c4a000',
  brightBlue: '#729fcf',
  brightMagenta: '#ad7fa8',
  brightCyan: '#34e2e2',
  // Traditional ANSI 97 "bright white" is near-white; on a light background it
  // would be invisible, so we map it to the regular text color.
  brightWhite: '#2e3436',
} as const;

type AnsiKey = keyof typeof DARK_BG_ANSI;

/**
 * Minimum contrast ratio we want every ANSI color to keep against the
 * terminal background, so that no program output is rendered invisible. ANSI
 * colors are emphasis colors, not body text, so this is intentionally below
 * WCAG's 4.5:1 — the goal is "definitely visible", not "AA compliant".
 */
const MIN_ANSI_CONTRAST = 2.5;

/**
 * Push `color` away from `background` until their contrast ratio reaches
 * MIN_ANSI_CONTRAST. Darkens on light backgrounds and lightens on dark ones,
 * mirroring how a human would adjust the swatch by eye.
 */
function ensureVisible(color: string, background: string, bgIsLight: boolean): string {
  if (getContrastRatio(color, background) >= MIN_ANSI_CONTRAST) {
    return color;
  }
  // Step in 10 % increments — enough resolution to land near the threshold
  // without overshooting into a different hue.
  let adjusted = color;
  for (let amount = 0.1; amount <= 0.9; amount += 0.1) {
    adjusted = bgIsLight ? darken(color, amount) : lighten(color, amount);
    if (getContrastRatio(adjusted, background) >= MIN_ANSI_CONTRAST) {
      return adjusted;
    }
  }
  return adjusted;
}

/**
 * Builds an xterm.js theme from a Material UI theme, so that the terminal
 * and the log viewer match the rest of the app (dark mode, custom themes…).
 *
 * The reference ANSI palette is chosen automatically based on the actual
 * luminance of the terminal background — not just `palette.mode` — so a
 * plugin that drops a dark surface into an otherwise-light theme (or vice
 * versa) still gets a readable palette. Any reference color that ends up too
 * close to the background is then nudged darker (light bg) or lighter (dark
 * bg) until it's visibly distinct.
 *
 * Plugin authors don't need to call this directly. To override individual
 * terminal colors, set the `terminal` field on the `AppTheme` passed to
 * `registerAppTheme(...)` — those values are read off `theme.palette.terminal`
 * here and take precedence over the auto-derived values.
 */
export function getXtermTheme(theme: Theme): ITheme {
  const overrides = theme.palette.terminal ?? {};
  const ansiOverrides = overrides.ansi ?? {};

  // Use the muted background so the terminal blends with surrounding dialog
  // surfaces while still being slightly distinct.
  const background =
    overrides.background ?? theme.palette.background.muted ?? theme.palette.background.default;

  // Pick the reference palette from the *actual* background luminance, not
  // `palette.mode`, so plugin-customised surfaces end up with a usable set.
  const bgIsLight = getLuminance(background) > 0.5;
  const referenceAnsi = bgIsLight ? LIGHT_BG_ANSI : DARK_BG_ANSI;

  // Default foreground/cursor come from the MUI palette, but if that ends up
  // unreadable against the chosen terminal background (e.g. a plugin pinned a
  // dark background inside an otherwise-light theme), fall back to the
  // background-appropriate text color.
  const defaultForeground = bgIsLight ? '#1f1f1f' : '#f5f5f5';
  let foreground = overrides.foreground ?? theme.palette.text.primary;
  if (!overrides.foreground && getContrastRatio(foreground, background) < 4.5) {
    foreground = defaultForeground;
  }
  let cursor = overrides.cursor ?? foreground;
  if (!overrides.cursor && getContrastRatio(cursor, background) < 4.5) {
    cursor = defaultForeground;
  }

  const ansi: Record<AnsiKey, string> = { ...referenceAnsi };
  (Object.keys(ansi) as AnsiKey[]).forEach(key => {
    const override = ansiOverrides[key];
    // Plugin-supplied colors are taken at face value (the plugin opted in to
    // them). Reference-palette colors are clamped to stay visible against the
    // chosen background.
    ansi[key] = override ?? ensureVisible(referenceAnsi[key], background, bgIsLight);
  });

  return {
    background,
    foreground,
    cursor,
    cursorAccent: background,
    // Selection overlay must contrast with the *terminal* background, not the
    // surrounding app theme — otherwise a dark terminal inside a light app
    // theme (the canonical use case for `terminal.background` overrides) gets
    // a dark selection on a dark background and the highlight is invisible.
    selectionBackground: bgIsLight ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.25)',
    selectionInactiveBackground: bgIsLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.15)',
    ...ansi,
  };
}
