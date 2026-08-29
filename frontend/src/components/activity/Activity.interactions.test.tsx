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

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TestContext } from '../../test';
import { ActivitiesRenderer, Activity } from './Activity';

function renderActivities(extraChrome?: React.ReactNode) {
  return render(
    <TestContext>
      {extraChrome}
      <div id="main" />
      <ActivitiesRenderer />
    </TestContext>
  );
}

function launchTemporary(id: string, overrides: Partial<Activity> = {}) {
  act(() => {
    Activity.launch({
      id,
      content: <div>{id} content</div>,
      location: 'split-right',
      title: id,
      temporary: true,
      ...overrides,
    });
  });
}

describe('Activity click-outside / Escape / pin interactions', () => {
  afterEach(() => {
    act(() => {
      Activity.reset();
    });
  });

  it('closes an unpinned temporary activity when clicking blank outside content', async () => {
    renderActivities();
    launchTemporary('a');

    expect(await screen.findByRole('complementary', { name: 'a' })).toBeInTheDocument();

    await new Promise(resolve => setTimeout(resolve, 150));
    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole('complementary', { name: 'a' })).not.toBeInTheDocument();
    });
  });

  it('still closes the activity when the outside click lands on a sidebar/top-bar nav link', async () => {
    renderActivities(
      <nav>
        <a href="#/home">Home</a>
      </nav>
    );
    launchTemporary('a');

    expect(await screen.findByRole('complementary', { name: 'a' })).toBeInTheDocument();

    await new Promise(resolve => setTimeout(resolve, 150));
    fireEvent.mouseDown(screen.getByRole('link', { name: 'Home' }));

    await waitFor(() => {
      expect(screen.queryByRole('complementary', { name: 'a' })).not.toBeInTheDocument();
    });
  });

  it('minimizes (does not close) a pinned activity on outside click', async () => {
    renderActivities();
    launchTemporary('a', { pinned: true });

    expect(await screen.findByRole('complementary', { name: 'a' })).toBeInTheDocument();

    await new Promise(resolve => setTimeout(resolve, 150));
    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole('complementary', { name: 'a' })).not.toBeInTheDocument();
    });
    // Still present in the ActivityBar, just minimized -- not removed from the store.
    expect(screen.getByText('a', { selector: 'div' })).toBeInTheDocument();
  });

  it('keeps a pinned temporary activity (minimized, not deleted) when another activity is launched', async () => {
    renderActivities();
    launchTemporary('a', { pinned: true });

    expect(await screen.findByRole('complementary', { name: 'a' })).toBeInTheDocument();

    launchTemporary('b');

    // "a" is minimized rather than removed: its panel is gone, but its
    // ActivityBar entry (and pinned icon) remains.
    await waitFor(() => {
      expect(screen.queryByRole('complementary', { name: 'a' })).not.toBeInTheDocument();
    });
    expect(await screen.findByRole('complementary', { name: 'b' })).toBeInTheDocument();
    expect(screen.getAllByText('a', { selector: 'div' }).length).toBeGreaterThan(0);
  });

  it('Escape closes a temporary activity but leaves a non-temporary one alone', async () => {
    renderActivities();
    launchTemporary('a');

    expect(await screen.findByRole('complementary', { name: 'a' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('complementary', { name: 'a' })).not.toBeInTheDocument();
    });

    // A non-temporary activity (e.g. a terminal/log viewer) must not be closed by Escape.
    act(() => {
      Activity.launch({
        id: 'terminal',
        content: <div>terminal content</div>,
        location: 'split-right',
        title: 'terminal',
      });
    });

    expect(await screen.findByRole('complementary', { name: 'terminal' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

    // Give any (incorrect) close a tick to happen before asserting it didn't.
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(screen.getByRole('complementary', { name: 'terminal' })).toBeInTheDocument();
  });

  it('pinning a minimized ActivityBar entry keeps it minimized and out of history', async () => {
    renderActivities();
    launchTemporary('a');
    act(() => {
      Activity.update('a', { minimized: true });
    });

    const pinButton = await screen.findByRole('button', { name: 'Pin' });
    act(() => {
      fireEvent.click(pinButton);
    });

    // Toggling pin on a minimized activity must not restore/un-minimize it.
    expect(screen.queryByRole('complementary', { name: 'a' })).not.toBeInTheDocument();
  });
});
