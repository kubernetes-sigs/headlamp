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

import { render, screen } from '@testing-library/react';
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
});
