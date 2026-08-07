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

import { fireEvent, render } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { useScrollPreservationOnDataChange } from './useScrollPreservation';

// jsdom doesn't compute layout, so scrollHeight / clientHeight default to 0.
// Force sensible values on any div we create so the hook's "container is
// scrollable" branch runs the way it would in a real browser.
function makeScrollable(el: HTMLElement, scrollHeight = 1000, clientHeight = 100) {
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
}

function makeUnscrollable(el: HTMLElement) {
  Object.defineProperty(el, 'scrollHeight', { value: 0, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 0, configurable: true });
}

function TestHarness({ data }: { data: unknown }) {
  const { ref, onScroll } = useScrollPreservationOnDataChange(data);
  return (
    <div
      data-testid="scroll"
      ref={ref}
      onScroll={onScroll}
      style={{ height: 100, overflow: 'auto' }}
    >
      <div style={{ height: 1000 }}>content</div>
    </div>
  );
}

describe('useScrollPreservationOnDataChange', () => {
  it('restores scrollTop when the container is reset to 0 while data changes', () => {
    const { getByTestId, rerender } = render(<TestHarness data={[1, 2, 3]} />);
    const scroll = getByTestId('scroll') as HTMLDivElement;
    makeScrollable(scroll);

    // User scrolls down.
    scroll.scrollTop = 250;
    fireEvent.scroll(scroll);

    // Simulate the production trigger: the same DOM node stays mounted, but
    // scrollTop is reset to 0 (as MRT's re-render does on a data reference
    // change). Then rerender with a fresh data reference so the layout
    // effect runs.
    scroll.scrollTop = 0;
    rerender(<TestHarness data={[1, 2, 3, 4]} />);

    expect(scroll.scrollTop).toBe(250);
  });

  it('does not fight subsequent renders once the user has scrolled to top', () => {
    const { getByTestId, rerender } = render(<TestHarness data={[1, 2, 3]} />);
    const scroll = getByTestId('scroll') as HTMLDivElement;
    makeScrollable(scroll);

    // User scrolls, then the app resets scrollTop to 0 as part of a legit
    // action (paging, sorting) which also fires a scroll event.
    scroll.scrollTop = 300;
    fireEvent.scroll(scroll);
    scroll.scrollTop = 0;
    fireEvent.scroll(scroll);

    rerender(<TestHarness data={[1, 2, 3, 4]} />);

    expect(scroll.scrollTop).toBe(0);
  });

  it('drops the saved position when the container becomes unscrollable', () => {
    const { getByTestId, rerender } = render(<TestHarness data={[1, 2, 3]} />);
    const scroll = getByTestId('scroll') as HTMLDivElement;
    makeScrollable(scroll);

    // User scrolls down in a populated list.
    scroll.scrollTop = 250;
    fireEvent.scroll(scroll);

    // Data goes empty; container isn't scrollable anymore.
    makeUnscrollable(scroll);
    scroll.scrollTop = 0;
    rerender(<TestHarness data={[]} />);

    // Data comes back. The prior saved position must not be applied to the
    // new dataset.
    makeScrollable(scroll);
    rerender(<TestHarness data={[9, 10, 11]} />);

    expect(scroll.scrollTop).toBe(0);
  });

  it('seeds the saved position when the container mounts already scrolled', () => {
    // Simulates hydration or deep-link restore: the container is mounted at
    // a non-zero scrollTop, and no scroll event has fired yet.
    const { getByTestId, rerender } = render(<TestHarness data={[1, 2, 3]} />);
    const scroll = getByTestId('scroll') as HTMLDivElement;
    makeScrollable(scroll);
    scroll.scrollTop = 180;

    // Force the effect to run once so the seed branch fires.
    rerender(<TestHarness data={[1, 2, 3, 4]} />);
    expect(scroll.scrollTop).toBe(180);

    // Now a data-driven reset to 0 should restore to the seeded position.
    scroll.scrollTop = 0;
    rerender(<TestHarness data={[1, 2, 3, 4, 5]} />);
    expect(scroll.scrollTop).toBe(180);
  });

  it('returns stable ref and onScroll identities across renders', () => {
    const captured: { ref: unknown; onScroll: unknown } = { ref: null, onScroll: null };

    function Capture({ data }: { data: unknown }) {
      const { ref, onScroll } = useScrollPreservationOnDataChange(data);
      useEffect(() => {
        captured.ref = ref;
        captured.onScroll = onScroll;
      });
      return null;
    }

    const { rerender } = render(<Capture data={[1]} />);
    const firstRef = captured.ref;
    const firstOnScroll = captured.onScroll;

    rerender(<Capture data={[1, 2]} />);
    expect(captured.ref).toBe(firstRef);
    expect(captured.onScroll).toBe(firstOnScroll);
  });
});
