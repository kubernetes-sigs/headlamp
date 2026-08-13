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

import { render, screen, waitForElementToBeRemoved, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReleaseNotesModal from './ReleaseNotesModal';

vi.mock('@iconify/react', () => ({ Icon: () => null }));

describe('ReleaseNotesModal', () => {
  it('renders GitHub release-note tables and HTML images', () => {
    const releaseNotes = `## Changes

| Feature | Status |
| ------- | ------ |
| Tables | Ready |

<img alt="Release preview" src="https://example.com/release.png" />`;

    render(<ReleaseNotesModal releaseNotes={releaseNotes} appVersion="1.2.3" />);

    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Feature' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: 'Tables' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Release preview' })).toHaveAttribute(
      'src',
      'https://example.com/release.png'
    );
  });

  // Regression coverage for the accessibility audit findings on #6966-adjacent
  // work: the dialog previously relied entirely on MUI's implicit
  // DialogContext id propagation for its accessible name, never moved focus
  // anywhere on open, had no onClose (Escape/backdrop did nothing), and its
  // scrollable content had no way to receive keyboard focus.

  it('has an accessible name derived from the title', () => {
    render(<ReleaseNotesModal releaseNotes="## hello" appVersion="1.9.9" />);
    // Matches by accessible name, not raw text, so this only passes if the
    // dialog's aria-labelledby actually resolves to the title.
    expect(screen.getByRole('dialog', { name: /Release Notes/ })).toBeInTheDocument();
  });

  it('moves focus to the title when it opens', () => {
    render(<ReleaseNotesModal releaseNotes="## hello" appVersion="1.9.9" />);
    expect(document.activeElement).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement?.textContent).toMatch(/Release Notes/);
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(<ReleaseNotesModal releaseNotes="## hello" appVersion="1.9.9" />);
    const dialog = screen.getByRole('dialog');

    await user.keyboard('{Escape}');
    // MUI's Dialog plays a closing transition before actually unmounting;
    // jsdom never fires the real transitionend that would resolve it
    // synchronously, so wait for the fallback timeout instead of asserting
    // absence immediately.
    await waitForElementToBeRemoved(dialog);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('makes the scrollable content keyboard-reachable', async () => {
    // Plain prose with no links: nothing inside the content is otherwise
    // tabbable, so without its own tabIndex, MUI's FocusTrap would only ever
    // be able to focus the outer dialog container — which cannot be scrolled
    // by PageDown/arrow keys, since scrolling keys act on the focused
    // element itself, not on an unrelated descendant. jsdom has no real
    // layout/scroll engine, so the actual PageDown-scrolls-it behavior is
    // verified in the e2e suite instead; this asserts the DOM precondition
    // that makes that possible.
    render(
      <ReleaseNotesModal releaseNotes="Plain prose with no links at all." appVersion="1.9.9" />
    );
    const content = screen.getByLabelText('translation|Release notes content');
    expect(content).toHaveAttribute('tabindex', '0');

    const user = userEvent.setup();
    // Tab past the title (focused on open) and the close button.
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(content);
  });
});
