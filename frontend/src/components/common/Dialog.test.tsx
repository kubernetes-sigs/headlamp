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

/**
 * Tests for common/Dialog mobile-fullscreen behaviour.
 *
 * Policy (Dialog.tsx):
 *   - On a mobile viewport (≤600 px) the dialog must open fullscreen.
 *   - On a desktop viewport it must not.
 *   - After the user presses the fullscreen toggle the choice is locked in,
 *     regardless of the current viewport.
 */

import DialogContent from '@mui/material/DialogContent';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

// ---------------------------------------------------------------------------
// Mock useMediaQuery so tests control the "is mobile" signal without needing a
// real browser viewport.
// ---------------------------------------------------------------------------
const mockUseMediaQuery = vi.fn<[], boolean>();
vi.mock('@mui/material/useMediaQuery', () => ({
  default: () => mockUseMediaQuery(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Helper: returns true if MUI rendered the dialog in fullscreen mode.
// MUI adds MuiDialog-paperFullScreen to the Paper element when fullScreen={true}.
function isFullscreen(): boolean {
  return document.querySelector('.MuiDialog-paperFullScreen') !== null;
}

describe('Dialog — mobile fullscreen policy', () => {
  it('opens fullscreen when the viewport is mobile (≤600 px)', () => {
    mockUseMediaQuery.mockReturnValue(true); // isMobile = true

    render(
      <Dialog open title="Test">
        <DialogContent>content</DialogContent>
      </Dialog>
    );

    expect(isFullscreen()).toBe(true);
  });

  it('does not open fullscreen on a desktop viewport', () => {
    mockUseMediaQuery.mockReturnValue(false); // isMobile = false

    render(
      <Dialog open title="Test">
        <DialogContent>content</DialogContent>
      </Dialog>
    );

    expect(isFullscreen()).toBe(false);
  });

  it('toggle button switches from fullscreen to windowed on mobile', () => {
    mockUseMediaQuery.mockReturnValue(true); // isMobile = true

    render(
      <Dialog open title="Test" withFullScreen>
        <DialogContent>content</DialogContent>
      </Dialog>
    );

    expect(isFullscreen()).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /toggle fullscreen/i }));

    expect(isFullscreen()).toBe(false);
  });

  it('toggle button switches from windowed to fullscreen on desktop', () => {
    mockUseMediaQuery.mockReturnValue(false); // isMobile = false

    render(
      <Dialog open title="Test" withFullScreen>
        <DialogContent>content</DialogContent>
      </Dialog>
    );

    expect(isFullscreen()).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /toggle fullscreen/i }));

    expect(isFullscreen()).toBe(true);
  });
});
