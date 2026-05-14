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

import { getContrastRatio } from '@mui/material/styles';
import { describe, expect, it } from 'vitest';
import type { AppTheme } from '../../lib/AppTheme';
import { createMuiTheme } from '../../lib/themes';
import { getXtermTheme } from './xtermTheme';

/**
 * The ANSI palette colors that xterm uses to draw program output.
 * Each one is asserted to remain readable against the chosen background.
 */
const ansiKeys = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
] as const;

/**
 * WCAG 2.1 SC 1.4.3 (Contrast Minimum, Level AA) requires a 4.5:1 contrast
 * ratio for normal-size body text. The default xterm foreground is what a
 * log viewer actually renders most of its text in, so this is the meaningful
 * accessibility bar for terminal colors.
 */
const WCAG_AA_TEXT = 4.5;

function assertAccessible(xtermTheme: ReturnType<typeof getXtermTheme>, label: string) {
  const bg = xtermTheme.background!;
  const fg = xtermTheme.foreground!;

  // Foreground text vs background must meet AA for normal text — this is
  // what the log viewer renders most of its content in.
  expect(
    getContrastRatio(fg, bg),
    `${label}: foreground (${fg}) vs background (${bg})`
  ).toBeGreaterThanOrEqual(WCAG_AA_TEXT);

  // Cursor needs to remain clearly visible on the terminal background.
  expect(
    getContrastRatio(xtermTheme.cursor!, bg),
    `${label}: cursor (${xtermTheme.cursor}) vs background (${bg})`
  ).toBeGreaterThanOrEqual(WCAG_AA_TEXT);

  // Each ANSI palette color must remain visibly distinguishable from the
  // background — Headlamp auto-clamps the built-in palette so that no
  // reference color drops below ~2:1 against the chosen surface. This
  // catches the "white on light bg" regression that the previous fixed
  // palette had.
  for (const key of ansiKeys) {
    const color = xtermTheme[key];
    expect(color, `${label}: missing ANSI color ${key}`).toBeTruthy();
    expect(
      getContrastRatio(color as string, bg),
      `${label}: ANSI ${key} (${color}) is too close to background (${bg})`
    ).toBeGreaterThanOrEqual(2);
  }
}

describe('getXtermTheme', () => {
  it('builds an accessible xterm theme from the built-in light theme', () => {
    const muiTheme = createMuiTheme({ name: 'light', base: 'light' });
    const xtermTheme = getXtermTheme(muiTheme);

    expect(muiTheme.palette.mode).toBe('light');
    // Background is sourced from palette.background.muted (terminals blend with
    // the surrounding dialog surface) and must not just be black-on-black.
    expect(xtermTheme.background).toBe(muiTheme.palette.background.muted);
    expect(xtermTheme.foreground).toBe(muiTheme.palette.text.primary);

    assertAccessible(xtermTheme, 'built-in light');
  });

  it('builds an accessible xterm theme from the built-in dark theme', () => {
    const muiTheme = createMuiTheme({ name: 'dark', base: 'dark' });
    const xtermTheme = getXtermTheme(muiTheme);

    expect(muiTheme.palette.mode).toBe('dark');
    expect(xtermTheme.background).toBe(muiTheme.palette.background.muted);
    expect(xtermTheme.foreground).toBe(muiTheme.palette.text.primary);

    assertAccessible(xtermTheme, 'built-in dark');
  });

  // Mirrors the AppTheme registered by the `custom-theme` plugin example.
  // Plugins can register themes via `registerAppTheme()` and we want to make
  // sure that even a plugin that overrides the surrounding palette still
  // produces a readable xterm widget.
  it('builds an accessible xterm theme from a plugin-registered light custom theme', () => {
    const customTheme: AppTheme = {
      name: 'my custom theme',
      base: 'light',
      primary: '#414141',
      secondary: '#eff2f5',
      text: {
        primary: '#44444f',
      },
      background: {
        muted: '#f5f5f5',
      },
    };

    const muiTheme = createMuiTheme(customTheme);
    const xtermTheme = getXtermTheme(muiTheme);

    expect(xtermTheme.background).toBe('#f5f5f5');
    expect(xtermTheme.foreground).toBe('#44444f');

    assertAccessible(xtermTheme, 'plugin custom light');
  });

  it('builds an accessible xterm theme from a plugin-registered dark custom theme', () => {
    const customTheme: AppTheme = {
      name: 'my dark plugin theme',
      base: 'dark',
      primary: '#bb86fc',
      text: {
        primary: '#e6e6e6',
      },
      background: {
        muted: '#121212',
      },
    };

    const muiTheme = createMuiTheme(customTheme);
    const xtermTheme = getXtermTheme(muiTheme);

    expect(xtermTheme.background).toBe('#121212');
    expect(xtermTheme.foreground).toBe('#e6e6e6');

    assertAccessible(xtermTheme, 'plugin custom dark');
  });

  it('honors inline `terminal` overrides set by a plugin via registerAppTheme', () => {
    // This is the pattern plugin authors use: no extra function call, just
    // set the terminal colors right inside the AppTheme they register.
    const customTheme: AppTheme = {
      name: 'plugin with explicit terminal',
      base: 'light',
      // The surrounding palette could be anything…
      background: {
        muted: '#ffffff',
      },
      text: {
        primary: '#000000',
      },
      // …but the plugin pins the terminal palette explicitly.
      terminal: {
        background: '#1e1e1e',
        foreground: '#f5f5f5',
        cursor: '#ffcc00',
        ansi: {
          red: '#ff5555',
          green: '#50fa7b',
          yellow: '#f1fa8c',
          blue: '#8be9fd',
          magenta: '#ff79c6',
          cyan: '#8be9fd',
        },
      },
    };

    const muiTheme = createMuiTheme(customTheme);
    const xtermTheme = getXtermTheme(muiTheme);

    // Plugin overrides take precedence over the values that would have been
    // derived from the surrounding MUI palette.
    expect(xtermTheme.background).toBe('#1e1e1e');
    expect(xtermTheme.foreground).toBe('#f5f5f5');
    expect(xtermTheme.cursor).toBe('#ffcc00');
    expect(xtermTheme.red).toBe('#ff5555');
    expect(xtermTheme.green).toBe('#50fa7b');

    // Any ANSI color the plugin didn't override is auto-derived from the
    // chosen background's luminance and clamped for visibility — the dark
    // bg (#1e1e1e) here would invisibly squash a literal `#000000` black,
    // so Headlamp lightens it. We just check that the result is visible.
    expect(getContrastRatio(xtermTheme.black as string, '#1e1e1e')).toBeGreaterThanOrEqual(2);

    assertAccessible(xtermTheme, 'plugin with terminal overrides');
  });

  it('falls back to background.default when the theme has no muted background', () => {
    const muiTheme = createMuiTheme({ name: 'minimal', base: 'light' });
    // Force the muted background to be absent to exercise the fallback.
    muiTheme.palette.background.muted = undefined as unknown as string;

    const xtermTheme = getXtermTheme(muiTheme);

    expect(xtermTheme.background).toBe(muiTheme.palette.background.default);
    assertAccessible(xtermTheme, 'no muted bg');
  });

  it('keeps `white` / `brightWhite` visible on a light terminal background', () => {
    // Regression: when the terminal background was light (`#faf9f8`), the
    // previous fixed palette mapped ANSI white to `#d3d7cf` and bright-white
    // to `#eeeeec`, both of which were near-invisible on the page.
    const muiTheme = createMuiTheme({ name: 'light', base: 'light' });
    const xtermTheme = getXtermTheme(muiTheme);
    const bg = xtermTheme.background!;

    expect(getContrastRatio(xtermTheme.white as string, bg)).toBeGreaterThanOrEqual(2);
    expect(getContrastRatio(xtermTheme.brightWhite as string, bg)).toBeGreaterThanOrEqual(2);
  });

  it('picks the ANSI palette by actual background luminance, not palette.mode', () => {
    // A "light"-mode plugin theme that pins a dark terminal background should
    // still get a dark-bg-friendly ANSI palette automatically.
    const muiTheme = createMuiTheme({
      name: 'light theme with dark terminal',
      base: 'light',
      terminal: { background: '#1e1e1e' },
    });

    const xtermTheme = getXtermTheme(muiTheme);
    expect(xtermTheme.background).toBe('#1e1e1e');
    // Dark-bg palette uses bright reds/greens; light-bg palette would use
    // muted ones (#cc0000, #4e9a06) that wash out on a near-black bg.
    expect(getContrastRatio(xtermTheme.red as string, '#1e1e1e')).toBeGreaterThanOrEqual(2.5);
    expect(getContrastRatio(xtermTheme.green as string, '#1e1e1e')).toBeGreaterThanOrEqual(2.5);
    assertAccessible(xtermTheme, 'light theme with dark terminal');
  });
});
