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

import { getContrastRatio, ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { createMuiTheme } from '../../lib/themes';
import { DropZoneBox } from './DropZoneBox';

const lightTheme = createMuiTheme({ name: 'light', base: 'light' });
const darkTheme = createMuiTheme({ name: 'dark', base: 'dark' });

// WCAG 1.4.11 non-text contrast minimum for a UI component boundary.
const MIN_NON_TEXT_CONTRAST = 3;

function parseColor(color: string) {
  const match = color.match(
    /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/
  );
  if (!match) {
    throw new Error(`Unable to parse color: ${color}`);
  }
  const [, r, g, b, a] = match;
  return { r: +r, g: +g, b: +b, a: a === undefined ? 1 : +a };
}

// MUI's getContrastRatio() ignores alpha, so a semi-transparent color must be
// alpha-composited onto its background first to get the color that's actually
// rendered, otherwise e.g. a near-invisible rgba(0,0,0,0.12) border reads as
// opaque black and scores a perfect (but meaningless) contrast ratio.
function compositeOnBackground(foreground: string, background: string) {
  const fg = parseColor(foreground);
  const bg = parseColor(background.startsWith('#') ? hexToRgb(background) : background);
  const r = Math.round(fg.a * fg.r + (1 - fg.a) * bg.r);
  const g = Math.round(fg.a * fg.g + (1 - fg.a) * bg.g);
  const b = Math.round(fg.a * fg.b + (1 - fg.a) * bg.b);
  return `rgb(${r}, ${g}, ${b})`;
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '');
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map(c => c + c)
          .join('')
      : normalized;
  const num = parseInt(full, 16);
  return `rgb(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255})`;
}

describe('DropZoneBox', () => {
  it('meets WCAG non-text contrast against the app background in light mode', () => {
    render(
      <ThemeProvider theme={lightTheme}>
        <DropZoneBox>content</DropZoneBox>
      </ThemeProvider>
    );

    const borderColor = getComputedStyle(screen.getByText('content')).borderColor;
    const renderedColor = compositeOnBackground(borderColor, lightTheme.palette.background.default);

    expect(borderColor).not.toBe('rgb(0, 0, 0)');
    expect(borderColor).not.toBe('rgba(0, 0, 0)');
    expect(
      getContrastRatio(renderedColor, lightTheme.palette.background.default)
    ).toBeGreaterThanOrEqual(MIN_NON_TEXT_CONTRAST);
  });

  it('meets WCAG non-text contrast against the app background in dark mode', () => {
    render(
      <ThemeProvider theme={darkTheme}>
        <DropZoneBox>content</DropZoneBox>
      </ThemeProvider>
    );

    const borderColor = getComputedStyle(screen.getByText('content')).borderColor;
    const renderedColor = compositeOnBackground(borderColor, darkTheme.palette.background.default);

    expect(borderColor).not.toBe('rgb(0, 0, 0)');
    expect(borderColor).not.toBe('rgba(0, 0, 0)');
    expect(
      getContrastRatio(renderedColor, darkTheme.palette.background.default)
    ).toBeGreaterThanOrEqual(MIN_NON_TEXT_CONTRAST);
  });
});
