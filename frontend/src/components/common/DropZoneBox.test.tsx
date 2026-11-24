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
import defaultAppThemes from '../App/defaultAppThemes';
import { DropZoneBox } from './DropZoneBox';

// WCAG 1.4.11 non-text contrast minimum for a UI component boundary.
const MIN_NON_TEXT_CONTRAST = 3;
const MIN_TEXT_CONTRAST = 4.5;

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
  const fg = parseColor(foreground.startsWith('#') ? hexToRgb(foreground) : foreground);
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

function interactionBorderColor(element: HTMLElement) {
  const generatedClass = Array.from(element.classList).find(className =>
    className.startsWith('css-')
  );
  if (!generatedClass) {
    throw new Error('DropZoneBox has no generated style class');
  }

  for (const styleSheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(styleSheet.cssRules)) {
      if (rule instanceof CSSStyleRule && rule.selectorText.includes(`.${generatedClass}:hover`)) {
        return rule.style.getPropertyValue('border-color');
      }
    }
  }
  throw new Error('DropZoneBox has no hover border rule');
}

describe.each(defaultAppThemes)('DropZoneBox with $name theme', appTheme => {
  const theme = createMuiTheme(appTheme);

  it('keeps its boundary and helper text visible', () => {
    const helperText = 'Select a file or drag and drop here';
    render(
      <ThemeProvider theme={theme}>
        <DropZoneBox>{helperText}</DropZoneBox>
      </ThemeProvider>
    );

    const dropZone = screen.getByText(helperText);
    const styles = getComputedStyle(dropZone);
    const background = theme.palette.background.default;
    const renderedBorder = compositeOnBackground(styles.borderColor, background);
    const renderedText = compositeOnBackground(styles.color, background);
    const renderedInteractionBorder = compositeOnBackground(
      interactionBorderColor(dropZone),
      background
    );
    const idleContrast = getContrastRatio(renderedBorder, background);
    const interactionContrast = getContrastRatio(renderedInteractionBorder, background);

    expect(idleContrast).toBeGreaterThanOrEqual(MIN_NON_TEXT_CONTRAST);
    expect(interactionContrast).toBeGreaterThanOrEqual(idleContrast);
    expect(getContrastRatio(renderedText, background)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });
});
