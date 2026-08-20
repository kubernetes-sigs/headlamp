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

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ShowHideLabel from './ShowHideLabel';

describe('ShowHideLabel', () => {
  it('does not render a toggle button for short text', () => {
    render(<ShowHideLabel maxChars={20}>Short text</ShowHideLabel>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not render a toggle button for short text even when initialized expanded', () => {
    // Regression test: needsButton used to be computed as unconditionally true
    // whenever expanded was true, so show={true} on text that never needed
    // truncating rendered a Collapse button that vanished (rather than toggled
    // back to Expand) the moment it was clicked.
    render(
      <ShowHideLabel show maxChars={20}>
        Short text
      </ShowHideLabel>
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a toggle button and expands/collapses long text on click', () => {
    const longText = 'a'.repeat(30);
    render(<ShowHideLabel maxChars={20}>{longText}</ShowHideLabel>);

    const button = screen.getByRole('button', { name: /expand/i });
    expect(button).toBeInTheDocument();
    expect(screen.getByText(longText.slice(0, 20), { exact: false })).toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.getByRole('button', { name: /collapse/i })).toBeInTheDocument();
    expect(screen.getByText(longText)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /collapse/i }));
    expect(screen.getByRole('button', { name: /expand/i })).toBeInTheDocument();
  });

  it('keeps the toggle button visible after expanding long text initialized with show', () => {
    const longText = 'a'.repeat(30);
    render(
      <ShowHideLabel show maxChars={20}>
        {longText}
      </ShowHideLabel>
    );

    expect(screen.getByRole('button', { name: /collapse/i })).toBeInTheDocument();
    expect(screen.getByText(longText)).toBeInTheDocument();
  });
});
