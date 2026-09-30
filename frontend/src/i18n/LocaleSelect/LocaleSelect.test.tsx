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

import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import LocaleSelect, { computeMenuPlacement } from './LocaleSelect';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: 'en',
      resolvedLanguage: 'en',
      options: { supportedLngs: ['en', 'es', 'fr'] },
      changeLanguage: vi.fn(),
    },
  }),
}));

vi.mock('../config', () => ({
  supportedLanguages: {
    en: { label: 'English', dir: 'ltr' },
    es: { label: 'Español', dir: 'ltr' },
    fr: { label: 'Français', dir: 'ltr' },
  },
}));

const theme = createMuiTheme({ name: 'test' });

describe('computeMenuPlacement', () => {
  const rect = (top: number, bottom: number) => ({ top, bottom });

  it('caps the menu at 300px when there is plenty of space below', () => {
    expect(computeMenuPlacement(800, rect(100, 140))).toEqual({
      above: false,
      maxHeight: 300,
      isAnchorVisible: true,
    });
  });

  it('caps the menu to the exact space below when that is smaller', () => {
    // 80px below the select → 80 - 20 margin = 60
    expect(computeMenuPlacement(500, rect(380, 420))).toEqual({
      above: false,
      maxHeight: 60,
      isAnchorVisible: true,
    });
  });

  it('keeps the menu below when exactly one item fits', () => {
    // 76px below the select → 76 - 20 = 56 = one item
    expect(computeMenuPlacement(500, rect(384, 424))).toEqual({
      above: false,
      maxHeight: 56,
      isAnchorVisible: true,
    });
  });

  it('opens above when less than one item fits below', () => {
    // 20px below → flip above; 200px above → 200 - 20 = 180
    expect(computeMenuPlacement(500, rect(200, 480))).toEqual({
      above: true,
      maxHeight: 180,
      isAnchorVisible: true,
    });
  });

  it('caps the above menu at 300px as well', () => {
    expect(computeMenuPlacement(800, rect(700, 780))).toEqual({
      above: true,
      maxHeight: 300,
      isAnchorVisible: true,
    });
  });

  it('never returns a negative height, staying below when both sides are empty', () => {
    expect(computeMenuPlacement(50, rect(10, 40))).toEqual({
      above: false,
      maxHeight: 0,
      isAnchorVisible: true,
    });
  });

  it('stays below when the space below is cramped but larger than above', () => {
    // 55px below (just under one item); 10px above caps to 0. The menu must
    // stay below and visible rather than flip to a zero-height space.
    expect(computeMenuPlacement(125, rect(10, 50))).toEqual({
      above: false,
      maxHeight: 55,
      isAnchorVisible: true,
    });
  });

  it('flips above when above is larger, even if both sides are cramped', () => {
    // 40px below → 20 after the margin; 60px above → 40.
    expect(computeMenuPlacement(120, rect(60, 80))).toEqual({
      above: true,
      maxHeight: 40,
      isAnchorVisible: true,
    });
  });

  it('reports the anchor as not visible when pushed below the viewport', () => {
    expect(computeMenuPlacement(500, rect(500, 540))).toEqual({
      above: false,
      maxHeight: 0,
      isAnchorVisible: false,
    });
    expect(computeMenuPlacement(500, rect(600, 640))).toEqual({
      above: false,
      maxHeight: 0,
      isAnchorVisible: false,
    });
  });

  it('reports the anchor as not visible when pushed above the viewport', () => {
    expect(computeMenuPlacement(500, rect(-40, 0))).toEqual({
      above: false,
      maxHeight: 0,
      isAnchorVisible: false,
    });
    expect(computeMenuPlacement(500, rect(-100, -60))).toEqual({
      above: false,
      maxHeight: 0,
      isAnchorVisible: false,
    });
  });
});

describe('LocaleSelect dropdown placement', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderLocaleSelect() {
    return render(
      <TestContext>
        <ThemeProvider theme={theme}>
          <LocaleSelect />
        </ThemeProvider>
      </TestContext>
    );
  }

  /**
   * jsdom has no layout engine, so the viewport height and the select box
   * geometry are stubbed to simulate where the select sits on the page.
   */
  function stubGeometry(top: number, bottom: number, viewportHeight = 500) {
    vi.stubGlobal('innerHeight', viewportHeight);
    // Query by class instead of role: the MUI modal aria-hides the page while
    // the menu is open, which hides the combobox from the accessibility tree.
    const select = document.querySelector('.MuiSelect-select') as HTMLElement;
    select.getBoundingClientRect = () =>
      ({
        top,
        bottom,
        left: 0,
        right: 120,
        width: 120,
        height: bottom - top,
        x: 0,
        y: top,
        toJSON: () => ({}),
      } as DOMRect);
  }

  function menuPaper() {
    return document.querySelector('.MuiPopover-paper') as HTMLElement;
  }

  /**
   * Opens the menu and waits for MUI to position it, which is when the
   * placement computed in onOpen becomes observable on the paper element.
   */
  async function openMenu(openFn: () => void) {
    openFn();
    return waitFor(() => {
      const paper = menuPaper();
      expect(paper).not.toBeNull();
      return paper;
    });
  }

  it('opens below, capped to 300px, when there is plenty of space below', async () => {
    renderLocaleSelect();
    stubGeometry(100, 140); // 360px below the select → capped at 300
    const paper = await openMenu(() => fireEvent.mouseDown(screen.getByRole('combobox')));
    expect(paper.style.maxHeight).toBe('300px');
  });

  it('opens above the select when not even one item fits below', async () => {
    renderLocaleSelect();
    stubGeometry(200, 480); // 20px below → flip above; 200px above → 180
    const paper = await openMenu(() => fireEvent.mouseDown(screen.getByRole('combobox')));
    expect(paper.style.maxHeight).toBe('180px');
  });

  it('recomputes the placement when the viewport resizes while the menu is open', async () => {
    renderLocaleSelect();
    stubGeometry(100, 140, 800); // 660px below the select → capped at 300
    const paper = await openMenu(() => fireEvent.mouseDown(screen.getByRole('combobox')));
    expect(paper.style.maxHeight).toBe('300px');

    // Shrink the viewport and move the select near its bottom: 40px below →
    // 20 after the margin (under one item); 100px above → 80.
    stubGeometry(100, 460, 500);
    fireEvent(window, new Event('resize'));
    await waitFor(() => expect(paper.style.maxHeight).toBe('80px'));
  });

  it('closes the menu when viewport shrinks so that the select box is hidden below', async () => {
    renderLocaleSelect();
    stubGeometry(100, 140, 800);
    await openMenu(() => fireEvent.mouseDown(screen.getByRole('combobox')));
    expect(menuPaper()).not.toBeNull();

    // Shrink viewport so select box is completely below the viewport
    stubGeometry(850, 890, 800);
    fireEvent(window, new Event('resize'));
    await waitFor(() => expect(menuPaper()).toBeNull());
  });

  it('closes the menu when the select box is pushed above the viewport', async () => {
    renderLocaleSelect();
    stubGeometry(100, 140, 800);
    await openMenu(() => fireEvent.mouseDown(screen.getByRole('combobox')));
    expect(menuPaper()).not.toBeNull();

    // Push select box completely above the viewport
    stubGeometry(-100, -60, 800);
    fireEvent(window, new Event('resize'));
    await waitFor(() => expect(menuPaper()).toBeNull());
  });

  it('applies the same capping when opened with the keyboard', async () => {
    renderLocaleSelect();
    stubGeometry(380, 420); // 80px below the select → 80 - 20 margin = 60
    const paper = await openMenu(() =>
      fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' })
    );
    expect(paper.style.maxHeight).toBe('60px');
  });
});
