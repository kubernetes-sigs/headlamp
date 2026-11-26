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

import { act, fireEvent, render, screen, waitForElementToBeRemoved } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../../test';
import UpdatePopup from './UpdatePopup';

vi.mock('@iconify/react', () => ({ Icon: () => null }));

// Regression coverage: all three Snackbar variants used to set
// ContentProps={{ 'aria-describedby': 'updatePopup' }} on the container, but
// no element in the tree ever had id="updatePopup" — a dangling ARIA
// reference. It was dead rather than actively harmful (SnackbarContent's
// default role="alert" still gets the message announced), but it should
// either resolve to a real element or not exist at all. These assert the
// attribute is gone outright, not just "valid if present" — the latter
// would trivially pass even if the dangling reference came back, since an
// absent attribute is indistinguishable from a fixed one under that check.
describe('UpdatePopup', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('does not set aria-describedby on the container while fetching', () => {
    render(
      <UpdatePopup
        releaseDownloadURL=""
        fetchingRelease
        releaseFetchFailed={false}
        skipUpdateHandler={() => {}}
      />
    );
    expect(screen.getByRole('alert')).not.toHaveAttribute('aria-describedby');
  });

  it('does not set aria-describedby on the container when the fetch fails', () => {
    render(
      <UpdatePopup
        releaseDownloadURL=""
        fetchingRelease={false}
        releaseFetchFailed
        skipUpdateHandler={() => {}}
      />
    );
    expect(screen.getByRole('alert')).not.toHaveAttribute('aria-describedby');
  });

  it('does not set aria-describedby on the container when an update is available', () => {
    render(
      <UpdatePopup
        releaseDownloadURL="https://example.com/release"
        fetchingRelease={false}
        releaseFetchFailed={false}
        skipUpdateHandler={() => {}}
      />
    );
    // The container itself has none; "Read more"'s own aria-describedby
    // (the new-tab hint) is covered separately below and does resolve to a
    // real element.
    expect(screen.getByRole('status')).not.toHaveAttribute('aria-describedby');
  });

  // "An update is available" isn't urgent — role="status" (implicit
  // aria-live="polite") announces it without interrupting whatever a screen
  // reader is currently reading, unlike SnackbarContent's default
  // role="alert" (assertive).
  it('announces the update-available toast politely, not as an interrupting alert', () => {
    render(
      <UpdatePopup
        releaseDownloadURL="https://example.com/release"
        fetchingRelease={false}
        releaseFetchFailed={false}
        skipUpdateHandler={() => {}}
      />
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // Regression coverage: "Read more" opens a new tab via window.open() from
  // a plain <button>, which — unlike <a target="_blank"> — carries none of
  // the conventional signaling that a link does. Screen reader users got no
  // warning before a new tab silently opened.
  it('warns that "Read more" opens in a new tab', () => {
    render(
      <UpdatePopup
        releaseDownloadURL="https://example.com/release"
        fetchingRelease={false}
        releaseFetchFailed={false}
        skipUpdateHandler={() => {}}
      />
    );
    const readMore = screen.getByRole('button', { name: /read more/i });
    const describedBy = readMore.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(/new tab/i);
  });

  it('renders nothing when no update URL, fetch, or failure state is active', () => {
    const { container } = render(
      <TestContext>
        <UpdatePopup releaseDownloadURL={null} skipUpdateHandler={vi.fn()} />
      </TestContext>
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows fetching snackbar and invokes skipUpdateHandler when Skip is clicked', () => {
    const skipUpdateHandler = vi.fn();

    render(
      <TestContext>
        <UpdatePopup
          releaseDownloadURL={null}
          fetchingRelease
          skipUpdateHandler={skipUpdateHandler}
        />
      </TestContext>
    );

    expect(screen.getByText('Fetching release information…')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(skipUpdateHandler).toHaveBeenCalledTimes(1);
  });

  it('shows fetch-failed snackbar and hides it after autoHideDuration expires', () => {
    vi.useFakeTimers();

    render(
      <TestContext>
        <UpdatePopup
          releaseDownloadURL={null}
          fetchingRelease={false}
          releaseFetchFailed
          skipUpdateHandler={vi.fn()}
        />
      </TestContext>
    );

    expect(screen.getByText('Failed to fetch release information')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(6000);
    });
    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(screen.queryByText('Failed to fetch release information')).not.toBeInTheDocument();
  });

  it('opens releaseDownloadURL safely when Read more is clicked', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const releaseURL = 'https://github.com/kubernetes-sigs/headlamp/releases/tag/v0.25.0';

    render(
      <TestContext>
        <UpdatePopup releaseDownloadURL={releaseURL} skipUpdateHandler={vi.fn()} />
      </TestContext>
    );

    expect(screen.getByText('An update is available')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Read more' }));

    expect(openSpy).toHaveBeenCalledWith(releaseURL, '_blank', 'noopener,noreferrer');
    expect(screen.getByText('An update is available')).toBeInTheDocument();
  });

  it('persists disable_update_check and closes when Disable update notifications is clicked', async () => {
    render(
      <TestContext>
        <UpdatePopup releaseDownloadURL="https://example.com/release" skipUpdateHandler={vi.fn()} />
      </TestContext>
    );

    const removal = waitForElementToBeRemoved(() => screen.queryByText('An update is available'));
    fireEvent.click(screen.getByRole('button', { name: 'Disable update notifications' }));

    expect(localStorage.getItem('disable_update_check')).toBe('true');
    await removal;
  });

  it('closes without disabling future update checks when Dismiss is clicked', async () => {
    render(
      <TestContext>
        <UpdatePopup releaseDownloadURL="https://example.com/release" skipUpdateHandler={vi.fn()} />
      </TestContext>
    );

    const removal = waitForElementToBeRemoved(() => screen.queryByText('An update is available'));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(localStorage.getItem('disable_update_check')).toBeNull();
    await removal;
  });
});
