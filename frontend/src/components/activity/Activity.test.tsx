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
import { act, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { createMuiTheme } from '../../lib/themes';
import { setDetailDrawerEnabled, setSelectedResource } from '../../redux/drawerModeSlice';
import store from '../../redux/stores/store';
import { TestContext } from '../../test';
import { ActivitiesRenderer, Activity, useActivity } from './Activity';
import { activitySlice, ActivityState } from './activitySlice';

const { reducer, actions } = activitySlice;
const { launchActivity, close, update } = actions;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('activitySlice', () => {
  let initialState: ActivityState;

  beforeEach(() => {
    initialState = {
      history: [],
      activities: {},
    };
  });

  describe('launchActivity', () => {
    const newActivity: Activity = {
      id: '1',
      content: 'Test Content',
      location: 'full',
      title: 'Test Activity',
    };

    it('should add a new activity', () => {
      const nextState = reducer(initialState, launchActivity(newActivity));
      expect(nextState.activities['1']).toEqual(newActivity);
      expect(nextState.history).toEqual(['1']);
    });

    it('should un-minimize an existing activity', () => {
      const stateWithMinimizedActivity: ActivityState = {
        history: [],
        activities: {
          '1': { ...newActivity, minimized: true },
        },
      };
      const nextState = reducer(stateWithMinimizedActivity, launchActivity(newActivity));
      expect(nextState.activities['1'].minimized).toBe(false);
      expect(nextState.history).toEqual(['1']);
    });

    it("adopts the caller's location when relaunching an existing details activity", () => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1920 });
      const stateWithActivity: ActivityState = {
        history: ['1'],
        activities: {
          '1': { ...newActivity, kind: 'details', location: 'split-right' },
        },
      };
      const relaunch = {
        ...newActivity,
        kind: 'details' as const,
        location: 'split-left' as const,
      };
      const nextState = reducer(stateWithActivity, launchActivity(relaunch));
      expect(nextState.activities['1'].location).toBe('split-left');
    });

    it('keeps the existing location when relaunching a non-details activity (e.g. a user-snapped plugin activity)', () => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1920 });
      const stateWithActivity: ActivityState = {
        history: ['1'],
        activities: {
          '1': { ...newActivity, location: 'split-left' },
        },
      };
      const relaunch = { ...newActivity, location: 'split-right' as const };
      const nextState = reducer(stateWithActivity, launchActivity(relaunch));
      expect(nextState.activities['1'].location).toBe('split-left');
    });

    it('should close temporary activities', () => {
      const temporaryActivity: Activity = {
        id: '2',
        content: 'Temp Content',
        location: 'full',
        title: 'Temp Activity',
        temporary: true,
      };
      const stateWithTempActivity: ActivityState = {
        history: ['2'],
        activities: {
          '2': temporaryActivity,
        },
      };
      const nextState = reducer(stateWithTempActivity, launchActivity(newActivity));
      expect(nextState.activities['2']).toBeUndefined();
      expect(nextState.history).not.toContain('2');
      expect(nextState.activities['1']).toBeDefined();
    });

    it('should preserve a centered window on medium screens', () => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });
      const mediumActivity = { ...newActivity, location: 'window-medium' as const };

      const nextState = reducer(initialState, launchActivity(mediumActivity));

      expect(nextState.activities['1'].location).toBe('window-medium');
    });

    it('should make a centered window fullscreen on phones', () => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
      const mediumActivity = { ...newActivity, location: 'window-medium' as const };

      const nextState = reducer(initialState, launchActivity(mediumActivity));

      expect(nextState.activities['1'].location).toBe('full');
    });

    it('handles non-browser environments where window is undefined', () => {
      const originalWindow = globalThis.window;
      try {
        (globalThis as any).window = undefined;
        const mediumActivity = { ...newActivity, location: 'window-medium' as const };
        let nextState: ActivityState | undefined;
        expect(() => {
          nextState = reducer(initialState, launchActivity(mediumActivity));
          vi.advanceTimersByTime(200);
        }).not.toThrow();

        expect(nextState?.activities['1'].location).toBe('window-medium');
      } finally {
        (globalThis as any).window = originalWindow;
      }
    });
  });

  describe('close', () => {
    it('should remove an activity', () => {
      const stateWithActivity: ActivityState = {
        history: ['1'],
        activities: {
          '1': { id: '1', content: 'Test', location: 'full' },
        },
      };
      const nextState = reducer(stateWithActivity, close('1'));
      expect(nextState.activities['1']).toBeUndefined();
      expect(nextState.history).toEqual([]);
    });
  });

  describe('update', () => {
    const initialActivity: Activity = {
      id: '1',
      content: 'Test',
      location: 'full',
    };
    const stateWithActivity: ActivityState = {
      history: ['1'],
      activities: {
        '1': initialActivity,
      },
    };

    it('should update an activity', () => {
      const updatedActivity = { id: '1', title: 'New Title' };
      const nextState = reducer(stateWithActivity, update(updatedActivity));
      expect(nextState.activities['1'].title).toBe('New Title');
    });

    it('should move activity to top of history if not minimized', () => {
      const stateWithMultipleActivities: ActivityState = {
        history: ['2', '1'],
        activities: {
          '1': initialActivity,
          '2': { id: '2', content: 'Test 2', location: 'full' },
        },
      };
      const updatedActivity = { id: '1', title: 'New Title' };
      const nextState = reducer(stateWithMultipleActivities, update(updatedActivity));
      expect(nextState.history).toEqual(['2', '1']);
    });

    it('should remove activity from history if minimized', () => {
      const updatedActivity = { id: '1', minimized: true };
      const nextState = reducer(stateWithActivity, update(updatedActivity));
      expect(nextState.history).toEqual([]);
    });

    it('should ignore updates for activities that do not exist', () => {
      const emptyState: ActivityState = { history: [], activities: {} };
      const nextState = reducer(emptyState, update({ id: 'ghost', title: 'Ghost' }));
      expect(nextState.activities['ghost']).toBeUndefined();
      expect(nextState.history).toEqual([]);
    });

    it('handles non-browser environments where window is undefined', () => {
      const originalWindow = globalThis.window;
      try {
        (globalThis as any).window = undefined;
        let nextState: ActivityState | undefined;
        expect(() => {
          nextState = reducer(stateWithActivity, update({ id: '1', title: 'Updated title' }));
          vi.advanceTimersByTime(200);
        }).not.toThrow();

        expect(nextState?.activities['1'].title).toBe('Updated title');
      } finally {
        (globalThis as any).window = originalWindow;
      }
    });
  });
});

describe('Activity.requestClose', () => {
  afterEach(() => {
    Activity.reset();
  });

  it('calls onCloseRequest instead of closing when the activity has one', () => {
    const onCloseRequest = vi.fn();
    Activity.launch({
      id: 'guarded',
      content: 'Guarded content',
      location: 'full',
      onCloseRequest,
    });

    Activity.requestClose('guarded');

    expect(onCloseRequest).toHaveBeenCalledTimes(1);
    expect(store.getState().activity.activities['guarded']).toBeDefined();
  });

  it('closes directly when the activity has no onCloseRequest', () => {
    Activity.launch({ id: 'plain', content: 'Plain content', location: 'full' });

    Activity.requestClose('plain');

    expect(store.getState().activity.activities['plain']).toBeUndefined();
  });

  it('does nothing harmful when the activity does not exist', () => {
    expect(() => Activity.requestClose('missing')).not.toThrow();
  });
});

describe('Activity close buttons', () => {
  afterEach(() => {
    Activity.reset();
  });

  function launchAndRender(activity: Partial<Activity> & { id: string }) {
    Activity.launch({
      content: 'Some content',
      location: 'full',
      title: 'Some activity',
      ...activity,
    });
    return render(
      <TestContext>
        <ActivitiesRenderer />
      </TestContext>
    );
  }

  it('routes the title-bar X through the close guard', () => {
    const onCloseRequest = vi.fn();
    launchAndRender({ id: 'guarded', onCloseRequest });

    fireEvent.click(screen.getByTitle('Close'));

    expect(onCloseRequest).toHaveBeenCalledTimes(1);
    expect(store.getState().activity.activities['guarded']).toBeDefined();
  });

  it('closes from the title-bar X when there is no guard', () => {
    launchAndRender({ id: 'plain' });

    fireEvent.click(screen.getByTitle('Close'));

    expect(store.getState().activity.activities['plain']).toBeUndefined();
  });

  it('routes the taskbar close button through the close guard', () => {
    const onCloseRequest = vi.fn();
    launchAndRender({ id: 'guarded', onCloseRequest });

    fireEvent.click(screen.getByLabelText('Close'));

    expect(onCloseRequest).toHaveBeenCalledTimes(1);
    expect(store.getState().activity.activities['guarded']).toBeDefined();
  });

  it('routes a middle-click on the taskbar button through the close guard', () => {
    const onCloseRequest = vi.fn();
    launchAndRender({ id: 'guarded', onCloseRequest });

    fireEvent.mouseDown(screen.getByRole('button', { name: /Some activity/ }), { button: 1 });

    expect(onCloseRequest).toHaveBeenCalledTimes(1);
    expect(store.getState().activity.activities['guarded']).toBeDefined();
  });

  it('closes from a middle-click on the taskbar button when there is no guard', () => {
    launchAndRender({ id: 'plain' });

    fireEvent.mouseDown(screen.getByRole('button', { name: /Some activity/ }), { button: 1 });

    expect(store.getState().activity.activities['plain']).toBeUndefined();
  });

  it('routes a click outside a temporary activity through the close guard', () => {
    const onCloseRequest = vi.fn();
    launchAndRender({ id: 'guarded', temporary: true, onCloseRequest });

    fireEvent.mouseDown(document.body);

    expect(onCloseRequest).toHaveBeenCalledTimes(1);
    expect(store.getState().activity.activities['guarded']).toBeDefined();
  });

  it('closes a temporary activity on a click outside when there is no guard', () => {
    launchAndRender({ id: 'plain', temporary: true });

    fireEvent.mouseDown(document.body);

    expect(store.getState().activity.activities['plain']).toBeUndefined();
  });

  it('routes Close All through each activity close guard', () => {
    const onCloseRequest = vi.fn();
    launchAndRender({ id: 'guarded', onCloseRequest });
    Activity.launch({
      id: 'plain',
      content: 'Plain content',
      location: 'full',
      title: 'Plain activity',
    });

    fireEvent.click(screen.getByLabelText('Overview'));
    fireEvent.click(screen.getByRole('button', { name: /Close All/ }));

    expect(onCloseRequest).toHaveBeenCalledTimes(1);
    expect(store.getState().activity.activities['guarded']).toBeDefined();
    expect(store.getState().activity.activities['plain']).toBeUndefined();
  });
});

describe('Activity pointer-down capture', () => {
  afterEach(() => {
    Activity.reset();
  });

  function launchTwoAndRender() {
    Activity.launch({ id: 'other', content: 'Other content', location: 'full', title: 'Other' });
    Activity.launch({
      id: 'target',
      content: <button>Inside target</button>,
      location: 'full',
      title: 'Target',
    });
    return render(
      <TestContext>
        <ActivitiesRenderer />
      </TestContext>
    );
  }

  it('brings a visible activity to the front of history on pointer-down', () => {
    launchTwoAndRender();
    act(() => {
      Activity.update('other', { minimized: false });
    });
    expect(store.getState().activity.history).toEqual(['target', 'other']);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Inside target' }));

    expect(store.getState().activity.history).toEqual(['other', 'target']);
    expect(store.getState().activity.activities['target'].minimized).toBeFalsy();
  });

  it('keeps a minimized activity minimized and out of history on pointer-down', () => {
    launchTwoAndRender();
    act(() => {
      Activity.update('target', { minimized: true });
    });
    expect(store.getState().activity.history).toEqual(['other']);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Inside target', hidden: true }));

    expect(store.getState().activity.activities['target'].minimized).toBe(true);
    expect(store.getState().activity.history).toEqual(['other']);
  });
});

/** Launches an activity with sensible defaults and renders the activities and taskbar. */
function renderActivity(activity: Partial<Activity> & { id: string }) {
  Activity.launch({
    content: 'Some content',
    location: 'full',
    title: 'Some activity',
    ...activity,
  });
  return render(
    <TestContext>
      <ActivitiesRenderer />
    </TestContext>
  );
}

/** The taskbar buttons that show an activity, as opposed to the title-bar buttons. */
function taskbarButtons() {
  return screen
    .getAllByRole('button', { hidden: true })
    .filter(button => button.closest('[role="complementary"]') === null)
    .filter(button => !button.hasAttribute('aria-label'));
}

describe('useActivity', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1920 });
  });

  afterEach(() => {
    Activity.reset();
  });

  function Probe() {
    const [activity, update] = useActivity();
    return (
      <button onClick={() => update({ title: 'Renamed from inside' })}>
        {`probe of ${activity.id}`}
      </button>
    );
  }

  it('gives the content its own activity', () => {
    renderActivity({ id: 'probed', content: <Probe /> });

    expect(screen.getByRole('button', { name: 'probe of probed' })).toBeInTheDocument();
  });

  it('updates only its own activity from inside the content', () => {
    Activity.launch({ id: 'other', content: 'Other content', location: 'full', title: 'Other' });
    renderActivity({ id: 'probed', content: <Probe /> });

    fireEvent.click(screen.getByRole('button', { name: 'probe of probed' }));

    expect(store.getState().activity.activities['probed'].title).toBe('Renamed from inside');
    expect(store.getState().activity.activities['other'].title).toBe('Other');
  });
});

describe('Activity title bar', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1920 });
  });

  afterEach(() => {
    Activity.reset();
  });

  it('shows the title in the header and in the taskbar', () => {
    renderActivity({ id: 'a' });

    expect(screen.getAllByText('Some activity')).toHaveLength(2);
  });

  it('shows the title only in the taskbar when the header hides it', () => {
    renderActivity({ id: 'a', hideTitleInHeader: true });

    expect(screen.getAllByText('Some activity')).toHaveLength(1);
  });

  it('labels the region with a string title', () => {
    renderActivity({ id: 'a' });

    expect(screen.getByRole('complementary', { name: 'Some activity' })).toBeInTheDocument();
  });

  it('leaves the region unlabeled when the title is not a string', () => {
    renderActivity({ id: 'a', title: <b>Rich title</b> });

    expect(screen.getByRole('complementary')).not.toHaveAttribute('aria-label');
  });

  it('shows the cluster in the header and in the taskbar when there is one', () => {
    renderActivity({ id: 'a', cluster: 'prod-cluster' });

    expect(screen.getAllByTitle('prod-cluster')).toHaveLength(2);
  });

  it('shows no cluster when the activity has none', () => {
    renderActivity({ id: 'a' });

    expect(screen.queryByTitle('prod-cluster')).not.toBeInTheDocument();
  });

  it('shows the icon in the header and in the taskbar', () => {
    renderActivity({ id: 'a', icon: <span data-testid="the-icon" /> });

    expect(screen.getAllByTestId('the-icon')).toHaveLength(2);
  });

  it('shows the icon next to the cluster in the taskbar', () => {
    renderActivity({ id: 'a', cluster: 'prod-cluster', icon: <span data-testid="the-icon" /> });

    expect(screen.getAllByTestId('the-icon')).toHaveLength(2);
  });

  it('moves focus into the activity when it is shown', () => {
    renderActivity({ id: 'a', content: <button>Inside</button> });

    expect(screen.getByRole('complementary')).toContainElement(
      document.activeElement as HTMLElement
    );
  });

  it('minimizes from the title bar and hides the activity', () => {
    renderActivity({ id: 'a' });

    fireEvent.click(screen.getByTitle('Minimize'));

    expect(store.getState().activity.activities['a'].minimized).toBe(true);
    expect(store.getState().activity.history).toEqual([]);
    expect(screen.getByRole('complementary', { hidden: true })).toHaveStyle('display: none');
  });

  it.each([
    ['full', 'position: absolute'],
    ['split-right', 'width: 50%'],
    ['split-right-wide', 'right: 0'],
    ['split-left', 'width: 50%'],
    ['split-top', 'top: 0'],
    ['split-bottom', 'bottom: 0'],
    ['window', 'border-radius: 10px'],
    ['window-medium', 'position: fixed'],
  ] as const)('lays out the %s location', (location, expectedStyle) => {
    renderActivity({ id: 'a', location });

    expect(screen.getByRole('complementary').firstElementChild).toHaveStyle(expectedStyle);
  });
});

describe('Activity taskbar', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1920 });
  });

  afterEach(() => {
    Activity.reset();
  });

  it('shows nothing when there are no activities', () => {
    render(
      <TestContext>
        <ActivitiesRenderer />
      </TestContext>
    );

    expect(screen.queryByLabelText('Overview')).not.toBeInTheDocument();
  });

  it('lists the most recently launched activity first', () => {
    Activity.launch({ id: 'first', content: 'First', location: 'full', title: 'First one' });
    renderActivity({ id: 'second', title: 'Second one' });

    expect(taskbarButtons().map(button => button.textContent)).toEqual(['Second one', 'First one']);
  });

  it('names an activity without a title', () => {
    renderActivity({ id: 'a', title: undefined });

    expect(taskbarButtons().map(button => button.textContent)).toEqual(['Something']);
  });

  it('shows a temporary activity in italics', () => {
    renderActivity({ id: 'a', temporary: true, title: 'Temp one' });

    const [button] = taskbarButtons();
    expect(within(button).getByTitle('Temp one')).toHaveStyle('font-style: italic');
  });

  it('minimizes the front activity when its taskbar button is clicked', () => {
    renderActivity({ id: 'a' });

    fireEvent.click(taskbarButtons()[0]);

    expect(store.getState().activity.activities['a'].minimized).toBe(true);
  });

  it('shows a minimized activity again when its taskbar button is clicked', () => {
    renderActivity({ id: 'a' });
    act(() => {
      Activity.update('a', { minimized: true });
    });

    fireEvent.click(taskbarButtons()[0]);

    expect(store.getState().activity.activities['a'].minimized).toBe(false);
    expect(store.getState().activity.history).toEqual(['a']);
  });

  it('brings a visible activity behind the front one to the front instead of minimizing it', () => {
    Activity.launch({ id: 'back', content: 'Back', location: 'full', title: 'Back one' });
    renderActivity({ id: 'front', title: 'Front one' });
    expect(store.getState().activity.history).toEqual(['back', 'front']);

    fireEvent.click(taskbarButtons().find(button => button.textContent === 'Back one')!);

    expect(store.getState().activity.activities['back'].minimized).toBe(false);
    expect(store.getState().activity.history).toEqual(['front', 'back']);
  });

  it('opens and closes the overview from the taskbar', () => {
    renderActivity({ id: 'a' });

    fireEvent.click(screen.getByLabelText('Overview'));
    expect(screen.getByRole('button', { name: /Close All/ })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Overview'));
    expect(screen.queryByRole('button', { name: /Close All/ })).not.toBeInTheDocument();
  });
});

describe('Activity snap menu', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1920 });
  });

  afterEach(() => {
    Activity.reset();
  });

  const windowButton = () => screen.getByTitle('Window');
  const menu = () => screen.queryByRole('menu', { name: 'Window' });
  const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

  describe('opened by clicking', () => {
    it('opens on click and reports it on the button', () => {
      renderActivity({ id: 'a' });
      expect(windowButton()).toHaveAttribute('aria-expanded', 'false');
      expect(windowButton()).not.toHaveAttribute('aria-controls');

      fireEvent.click(windowButton());

      expect(menu()).toBeInTheDocument();
      expect(windowButton()).toHaveAttribute('aria-expanded', 'true');
      expect(windowButton()).toHaveAttribute('aria-controls', 'snap-menu');
    });

    it('closes when the button is clicked again', () => {
      renderActivity({ id: 'a' });
      fireEvent.click(windowButton());

      fireEvent.click(windowButton());

      expect(menu()).not.toBeInTheDocument();
    });

    it('stays open when the pointer leaves the button', () => {
      renderActivity({ id: 'a' });
      fireEvent.click(windowButton());

      fireEvent.mouseLeave(windowButton());
      advance(500);

      expect(menu()).toBeInTheDocument();
    });

    it('closes on a click outside the menu', () => {
      renderActivity({ id: 'a' });
      fireEvent.click(windowButton());
      // The click-away listener only starts listening after the click that opened the menu.
      advance(0);

      fireEvent.click(document.body);

      expect(menu()).not.toBeInTheDocument();
    });

    it('closes on Escape and gives the focus back to the button', () => {
      renderActivity({ id: 'a' });
      fireEvent.click(windowButton());

      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

      expect(menu()).not.toBeInTheDocument();
      expect(windowButton()).toHaveFocus();
    });

    it('ignores other keys', () => {
      renderActivity({ id: 'a' });
      fireEvent.click(windowButton());

      fireEvent.keyDown(screen.getByRole('menu'), { key: 'a' });

      expect(menu()).toBeInTheDocument();
    });
  });

  describe('opened by hovering', () => {
    it('opens after the pointer rests on the button', () => {
      renderActivity({ id: 'a' });

      fireEvent.mouseEnter(windowButton());
      advance(349);
      expect(menu()).not.toBeInTheDocument();
      advance(1);

      expect(menu()).toBeInTheDocument();
    });

    it('does not open when the pointer leaves first', () => {
      renderActivity({ id: 'a' });

      fireEvent.mouseEnter(windowButton());
      advance(200);
      fireEvent.mouseLeave(windowButton());
      advance(500);

      expect(menu()).not.toBeInTheDocument();
    });

    it('restarts the wait when the pointer enters again', () => {
      renderActivity({ id: 'a' });

      fireEvent.mouseEnter(windowButton());
      advance(300);
      fireEvent.mouseEnter(windowButton());
      advance(300);
      expect(menu()).not.toBeInTheDocument();
      advance(50);

      expect(menu()).toBeInTheDocument();
    });

    it('closes shortly after the pointer leaves the button', () => {
      renderActivity({ id: 'a' });
      fireEvent.mouseEnter(windowButton());
      advance(350);

      fireEvent.mouseLeave(windowButton());
      advance(149);
      expect(menu()).toBeInTheDocument();
      advance(1);

      expect(menu()).not.toBeInTheDocument();
    });

    it('stays open while the pointer moves from the button into the menu', () => {
      renderActivity({ id: 'a' });
      fireEvent.mouseEnter(windowButton());
      advance(350);

      fireEvent.mouseLeave(windowButton());
      advance(100);
      fireEvent.mouseEnter(screen.getByRole('menu').parentElement!);
      advance(500);

      expect(menu()).toBeInTheDocument();
    });

    it('closes shortly after the pointer leaves the menu', () => {
      renderActivity({ id: 'a' });
      fireEvent.mouseEnter(windowButton());
      advance(350);
      const paper = screen.getByRole('menu').parentElement!;

      fireEvent.mouseLeave(paper);
      advance(150);

      expect(menu()).not.toBeInTheDocument();
    });

    it('stays open when the pointer leaves the menu and comes back in time', () => {
      renderActivity({ id: 'a' });
      fireEvent.mouseEnter(windowButton());
      advance(350);
      const paper = screen.getByRole('menu').parentElement!;

      fireEvent.mouseLeave(paper);
      advance(100);
      fireEvent.mouseEnter(paper);
      advance(500);

      expect(menu()).toBeInTheDocument();
    });

    it('is not closed by a click elsewhere', () => {
      renderActivity({ id: 'a' });
      fireEvent.mouseEnter(windowButton());
      advance(350);
      // Let the click-away listener become active, so only the hover rule can keep the menu open.
      advance(0);

      fireEvent.click(document.body);

      expect(menu()).toBeInTheDocument();
    });

    it('turns into a click-opened menu when the button is clicked', () => {
      renderActivity({ id: 'a' });
      fireEvent.mouseEnter(windowButton());
      advance(350);

      fireEvent.click(windowButton());
      fireEvent.mouseLeave(windowButton());
      advance(500);

      expect(menu()).toBeInTheDocument();
    });

    it('does not open a pending hover menu after a click', () => {
      renderActivity({ id: 'a' });
      fireEvent.mouseEnter(windowButton());
      advance(100);

      fireEvent.click(windowButton());
      fireEvent.click(windowButton());
      advance(500);

      expect(menu()).not.toBeInTheDocument();
    });

    it('does not restart a close that is pending when the button is clicked', () => {
      renderActivity({ id: 'a' });
      fireEvent.mouseEnter(windowButton());
      advance(350);
      fireEvent.mouseLeave(windowButton());

      fireEvent.click(windowButton());
      advance(500);

      expect(menu()).toBeInTheDocument();
    });

    it('stays open when the pointer comes back to the button before the menu closes', () => {
      renderActivity({ id: 'a' });
      fireEvent.mouseEnter(windowButton());
      advance(350);
      fireEvent.mouseLeave(windowButton());
      advance(100);

      fireEvent.mouseEnter(windowButton());
      advance(100);

      expect(menu()).toBeInTheDocument();
    });

    it('closes once, on time, when the pointer leaves the button more than once', () => {
      renderActivity({ id: 'a' });
      fireEvent.mouseEnter(windowButton());
      advance(350);

      fireEvent.mouseLeave(windowButton());
      advance(100);
      fireEvent.mouseLeave(windowButton());
      advance(149);
      expect(menu()).toBeInTheDocument();
      advance(1);

      expect(menu()).not.toBeInTheDocument();
    });

    it('restarts the close when the pointer leaves the menu while a close is pending', () => {
      renderActivity({ id: 'a' });
      fireEvent.mouseEnter(windowButton());
      advance(350);
      fireEvent.mouseLeave(windowButton());
      advance(100);

      fireEvent.mouseLeave(screen.getByRole('menu').parentElement!);
      advance(149);
      expect(menu()).toBeInTheDocument();
      advance(1);

      expect(menu()).not.toBeInTheDocument();
    });

    /**
     * How many timers other components leave behind when an activity goes away after
     * these steps, which is what is left even when the activity cleans up after itself.
     */
    function timersLeftByOthers(steps: () => void) {
      const view = renderActivity({ id: 'plain' });
      steps();
      view.unmount();
      const left = vi.getTimerCount();
      vi.clearAllTimers();
      Activity.reset();
      return left;
    }

    it('drops a pending close when the activity goes away', () => {
      const baseline = timersLeftByOthers(() => {
        fireEvent.mouseEnter(windowButton());
        advance(350);
      });
      const view = renderActivity({ id: 'a' });
      fireEvent.mouseEnter(windowButton());
      advance(350);
      fireEvent.mouseLeave(windowButton());
      expect(vi.getTimerCount()).toBeGreaterThan(baseline);

      view.unmount();

      expect(vi.getTimerCount()).toBe(baseline);
    });

    it('drops a pending open when the activity goes away', () => {
      const baseline = timersLeftByOthers(() => {});
      const view = renderActivity({ id: 'a' });
      fireEvent.mouseEnter(windowButton());
      expect(vi.getTimerCount()).toBeGreaterThan(baseline);

      view.unmount();

      expect(vi.getTimerCount()).toBe(baseline);
    });
  });

  describe('opened with the keyboard', () => {
    it.each(['Enter', 'ArrowDown'])('opens on %s', key => {
      renderActivity({ id: 'a' });

      fireEvent.keyDown(windowButton(), { key });

      expect(menu()).toBeInTheDocument();
    });

    it('does not open on other keys', () => {
      renderActivity({ id: 'a' });

      fireEvent.keyDown(windowButton(), { key: 'a' });

      expect(menu()).not.toBeInTheDocument();
    });

    it('stays open when Enter is pressed on an open menu', () => {
      renderActivity({ id: 'a' });
      fireEvent.keyDown(windowButton(), { key: 'Enter' });

      fireEvent.keyDown(windowButton(), { key: 'Enter' });

      expect(menu()).toBeInTheDocument();
    });

    it('cancels a pending hover open', () => {
      renderActivity({ id: 'a' });
      fireEvent.mouseEnter(windowButton());

      fireEvent.keyDown(windowButton(), { key: 'Enter' });
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
      advance(500);

      expect(menu()).not.toBeInTheDocument();
    });
  });

  describe('items', () => {
    it.each([
      ['Fullscreen', 'full', 'split-left'],
      ['Snap Left', 'split-left', 'full'],
      ['Snap Right', 'split-right', 'full'],
      ['Snap Top', 'split-top', 'full'],
      ['Snap Bottom', 'split-bottom', 'full'],
    ] as const)('"%s" moves the activity to %s and closes the menu', (name, location, start) => {
      renderActivity({ id: 'a', location: start });
      fireEvent.click(windowButton());

      fireEvent.click(screen.getByRole('menuitem', { name }));

      expect(store.getState().activity.activities['a'].location).toBe(location);
      expect(menu()).not.toBeInTheDocument();
    });

    it.each([
      ['Fullscreen', 'full'],
      ['Snap Left', 'split-left'],
      ['Snap Right', 'split-right'],
      ['Snap Top', 'split-top'],
      ['Snap Bottom', 'split-bottom'],
    ] as const)('marks only the current location, here "%s"', (name, location) => {
      renderActivity({ id: 'a', location });
      fireEvent.click(windowButton());

      const selected = screen
        .getAllByRole('menuitem')
        .filter(item => item.classList.contains('Mui-selected'))
        .map(item => item.getAttribute('aria-label'));
      expect(selected).toEqual([name]);
    });

    it('offers no item for a location that has no menu entry', () => {
      renderActivity({ id: 'a', location: 'split-right-wide' });
      fireEvent.click(windowButton());

      expect(
        screen.getAllByRole('menuitem').filter(item => item.classList.contains('Mui-selected'))
      ).toEqual([]);
    });
  });

  it('has no window menu in the overview previews', () => {
    renderActivity({ id: 'a' });
    fireEvent.click(screen.getByLabelText('Overview'));

    expect(screen.queryByTitle('Window')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Minimize')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Close')).not.toBeInTheDocument();
  });
});

describe('Activity overview', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1920 });
  });

  afterEach(() => {
    Activity.reset();
  });

  const closeAll = () => screen.queryByRole('button', { name: /Close All/ });
  const previewOf = () => screen.getByRole('complementary', { hidden: true }).firstElementChild!;

  it('closes by itself when the last activity goes away', () => {
    renderActivity({ id: 'a' });
    fireEvent.click(screen.getByLabelText('Overview'));
    expect(closeAll()).toBeInTheDocument();

    act(() => {
      Activity.close('a');
    });

    expect(closeAll()).not.toBeInTheDocument();
  });

  it('stays open while other activities are left', () => {
    Activity.launch({ id: 'other', content: 'Other', location: 'full', title: 'Other' });
    renderActivity({ id: 'a' });
    fireEvent.click(screen.getByLabelText('Overview'));

    act(() => {
      Activity.close('a');
    });

    expect(closeAll()).toBeInTheDocument();
  });

  it('shows a minimized activity again and leaves the overview when its preview is clicked', () => {
    renderActivity({ id: 'a' });
    act(() => {
      Activity.update('a', { minimized: true });
    });
    fireEvent.click(screen.getByLabelText('Overview'));

    fireEvent.pointerDown(previewOf());

    expect(closeAll()).not.toBeInTheDocument();
    expect(store.getState().activity.activities['a'].minimized).toBe(false);
  });

  it('does not let a click on a preview reach what is behind it', () => {
    const onContentPointerDown = vi.fn();
    renderActivity({
      id: 'a',
      content: <button onPointerDown={onContentPointerDown}>Inside</button>,
    });
    fireEvent.click(screen.getByLabelText('Overview'));

    // fireEvent returns false when the default action was prevented.
    expect(
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Inside', hidden: true }))
    ).toBe(false);
    // The capture handler must also stop the event from reaching the content.
    expect(onContentPointerDown).not.toHaveBeenCalled();
  });

  it('does not prevent the default action of a pointer-down outside the overview', () => {
    const onContentPointerDown = vi.fn();
    renderActivity({
      id: 'a',
      content: <button onPointerDown={onContentPointerDown}>Inside</button>,
    });

    expect(fireEvent.pointerDown(screen.getByRole('button', { name: 'Inside' }))).toBe(true);
    expect(onContentPointerDown).toHaveBeenCalledTimes(1);
  });

  it('leaves the overview when Close All is used, also with nothing left to close', () => {
    renderActivity({ id: 'a' });
    fireEvent.click(screen.getByLabelText('Overview'));

    fireEvent.click(closeAll()!);

    expect(closeAll()).not.toBeInTheDocument();
    expect(store.getState().activity.activities['a']).toBeUndefined();
  });

  it('leaves the overview when Close All is used, even if an activity stays open', () => {
    // The close guard keeps the activity, so the overview is not left by the activity going away.
    const onCloseRequest = vi.fn();
    renderActivity({ id: 'a', onCloseRequest });
    fireEvent.click(screen.getByLabelText('Overview'));

    fireEvent.click(closeAll()!);

    expect(onCloseRequest).toHaveBeenCalledTimes(1);
    expect(store.getState().activity.activities['a']).toBeDefined();
    expect(closeAll()).not.toBeInTheDocument();
  });

  it('hides the header and the content of every activity while the overview is open', () => {
    renderActivity({ id: 'a', content: <button>Inside</button> });
    // Only the header shows the title inside the activity before the overview is opened.
    const headerTitle = within(screen.getByRole('complementary')).getAllByTitle('Some activity')[0];
    expect(headerTitle).toBeVisible();

    fireEvent.click(screen.getByLabelText('Overview'));

    expect(headerTitle).not.toBeVisible();
    expect(screen.getByRole('button', { name: 'Inside', hidden: true })).not.toBeVisible();
  });

  it('shows a minimized activity as a preview', () => {
    renderActivity({ id: 'a' });
    act(() => {
      Activity.update('a', { minimized: true });
    });
    expect(screen.getByRole('complementary', { hidden: true })).toHaveStyle('display: none');

    fireEvent.click(screen.getByLabelText('Overview'));

    expect(screen.getByRole('complementary', { hidden: true })).not.toHaveStyle('display: none');
  });

  it('shows the title and icon in the preview', () => {
    renderActivity({ id: 'a', icon: <span data-testid="the-icon" /> });
    fireEvent.click(screen.getByLabelText('Overview'));

    // Header, preview and taskbar each show them.
    expect(screen.getAllByTestId('the-icon')).toHaveLength(3);
    expect(screen.getAllByTitle('Some activity').length).toBeGreaterThanOrEqual(2);
  });
});

describe('Activity keyboard shortcuts', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1920 });
  });

  afterEach(() => {
    Activity.reset();
  });

  /** Presses a shortcut such as Ctrl+ArrowLeft on the page. */
  function press(code: string, { shift = false }: { shift?: boolean } = {}) {
    fireEvent.keyDown(document.body, { key: code, code, ctrlKey: true, shiftKey: shift });
  }

  const closeAll = () => screen.queryByRole('button', { name: /Close All/ });

  it('toggles the overview with Ctrl+ArrowDown', () => {
    renderActivity({ id: 'a' });
    expect(closeAll()).not.toBeInTheDocument();

    press('ArrowDown');
    expect(closeAll()).toBeInTheDocument();

    press('ArrowDown');
    expect(closeAll()).not.toBeInTheDocument();
  });

  it.each([
    ['Ctrl+ArrowLeft', 'ArrowLeft', false, 'split-left'],
    ['Ctrl+ArrowRight', 'ArrowRight', false, 'split-right'],
    ['Ctrl+Shift+ArrowUp', 'ArrowUp', true, 'split-top'],
    ['Ctrl+Shift+ArrowDown', 'ArrowDown', true, 'split-bottom'],
  ] as const)('%s snaps the front activity', (_name, code, shift, location) => {
    renderActivity({ id: 'a' });

    press(code, { shift });

    expect(store.getState().activity.activities['a'].location).toBe(location);
  });

  it('Ctrl+ArrowUp makes the front activity fullscreen again', () => {
    renderActivity({ id: 'a', location: 'split-left' });

    press('ArrowUp');

    expect(store.getState().activity.activities['a'].location).toBe('full');
  });

  it('only moves the front activity', () => {
    Activity.launch({ id: 'back', content: 'Back', location: 'full', title: 'Back' });
    renderActivity({ id: 'front' });

    press('ArrowLeft');

    expect(store.getState().activity.activities['front'].location).toBe('split-left');
    expect(store.getState().activity.activities['back'].location).toBe('full');
  });

  it('moves the activity that is in front after another one is minimized', () => {
    Activity.launch({ id: 'back', content: 'Back', location: 'full', title: 'Back' });
    renderActivity({ id: 'front' });
    act(() => {
      Activity.update('front', { minimized: true });
    });

    press('ArrowLeft');

    expect(store.getState().activity.activities['back'].location).toBe('split-left');
    expect(store.getState().activity.activities['front'].location).toBe('full');
  });

  it.each([
    ['Ctrl+ArrowLeft', 'ArrowLeft', false],
    ['Ctrl+ArrowRight', 'ArrowRight', false],
    ['Ctrl+Shift+ArrowUp', 'ArrowUp', true],
    ['Ctrl+Shift+ArrowDown', 'ArrowDown', true],
    ['Ctrl+ArrowUp', 'ArrowUp', false],
  ] as const)('%s does nothing when no activity is in front', (_name, code, shift) => {
    render(
      <TestContext>
        <ActivitiesRenderer />
      </TestContext>
    );

    expect(() => press(code, { shift })).not.toThrow();

    expect(store.getState().activity.activities).toEqual({});
  });
});

describe('Activity click outside', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1920 });
  });

  afterEach(() => {
    Activity.reset();
    store.dispatch(setSelectedResource(undefined));
    store.dispatch(setDetailDrawerEnabled(false));
  });

  const exists = (id: string) => store.getState().activity.activities[id] !== undefined;

  it('keeps a temporary activity open on a click inside it', () => {
    renderActivity({ id: 'a', temporary: true, content: <button>Inside</button> });

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Inside' }));

    expect(exists('a')).toBe(true);
  });

  it('keeps a permanent activity open on a click outside', () => {
    renderActivity({ id: 'a' });

    fireEvent.mouseDown(document.body);

    expect(exists('a')).toBe(true);
  });

  it('keeps a minimized temporary activity open on a click outside', () => {
    renderActivity({ id: 'a', temporary: true, minimized: true });

    fireEvent.mouseDown(document.body);

    expect(exists('a')).toBe(true);
  });

  it('keeps a temporary activity open on a click outside while the overview is open', () => {
    renderActivity({ id: 'a', temporary: true });
    fireEvent.click(screen.getByLabelText('Overview'));

    fireEvent.mouseDown(document.body);

    expect(exists('a')).toBe(true);
  });

  it('keeps a temporary details drawer open on a click outside', () => {
    renderActivity({ id: 'a', temporary: true, kind: 'details' });

    fireEvent.mouseDown(document.body);

    expect(exists('a')).toBe(true);
  });

  it('closes a temporary activity on a click outside', () => {
    renderActivity({ id: 'a', temporary: true });

    fireEvent.mouseDown(document.body);

    expect(exists('a')).toBe(false);
  });

  it('stops closing once the user has interacted with the activity', () => {
    renderActivity({ id: 'a', temporary: true, content: <button>Inside</button> });

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Inside' }));
    expect(store.getState().activity.activities['a'].temporary).toBe(false);
    fireEvent.mouseDown(document.body);

    expect(exists('a')).toBe(true);
  });

  it('stops listening when the activity is removed from the page', () => {
    const addListener = vi.spyOn(document, 'addEventListener');
    const removeListener = vi.spyOn(document, 'removeEventListener');
    const view = renderActivity({ id: 'a', temporary: true });
    // Other components also listen for mousedown, so pick the activity's own handler.
    const handler = addListener.mock.calls.find(
      ([type, listener]) =>
        type === 'mousedown' &&
        typeof listener === 'function' &&
        listener.name === 'handleClickOutside'
    )?.[1];
    expect(handler).toBeDefined();

    view.unmount();

    // The same handler that was registered must be removed, or it would keep running.
    expect(removeListener).toHaveBeenCalledWith('mousedown', handler);
    fireEvent.mouseDown(document.body);
    expect(exists('a')).toBe(true);
  });

  describe('with a resource details drawer', () => {
    const openDrawer = () => {
      act(() => {
        store.dispatch(setDetailDrawerEnabled(true));
        store.dispatch(
          setSelectedResource({ kind: 'Pod', metadata: { name: 'pod-a' }, cluster: 'main' })
        );
      });
    };

    it('keeps a temporary activity open while the drawer is open', () => {
      renderActivity({ id: 'a', temporary: true });
      openDrawer();

      fireEvent.mouseDown(document.body);

      expect(exists('a')).toBe(true);
    });

    it('closes a temporary activity when drawers are disabled', () => {
      renderActivity({ id: 'a', temporary: true });
      act(() => {
        store.dispatch(setDetailDrawerEnabled(false));
        store.dispatch(
          setSelectedResource({ kind: 'Pod', metadata: { name: 'pod-a' }, cluster: 'main' })
        );
      });

      fireEvent.mouseDown(document.body);

      expect(exists('a')).toBe(false);
    });

    it('closes a temporary activity when no resource is selected', () => {
      renderActivity({ id: 'a', temporary: true });
      act(() => {
        store.dispatch(setDetailDrawerEnabled(true));
      });

      fireEvent.mouseDown(document.body);

      expect(exists('a')).toBe(false);
    });

    it('closes a temporary activity on a small screen, where the drawer is not shown', () => {
      const original = window.matchMedia;
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: (query: string) => ({
          matches: true,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }),
      });
      try {
        renderActivity({ id: 'a', temporary: true });
        openDrawer();

        fireEvent.mouseDown(document.body);

        expect(exists('a')).toBe(false);
      } finally {
        Object.defineProperty(window, 'matchMedia', {
          configurable: true,
          writable: true,
          value: original,
        });
      }
    });
  });
});

describe('Activity window resizing', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1920 });
  });

  afterEach(() => {
    // Release any drag a test left open, so its document listeners do not leak into later tests.
    fireEvent.pointerUp(document.body);
    Activity.reset();
    vi.restoreAllMocks();
  });

  const activityElement = () => screen.getByRole('complementary').firstElementChild as HTMLElement;
  const resizer = () => activityElement().lastElementChild as HTMLElement;

  /** Makes the activity measure 600x400, as jsdom has no layout. */
  function measureActivity() {
    vi.spyOn(activityElement(), 'getBoundingClientRect').mockReturnValue({
      width: 600,
      height: 400,
    } as DOMRect);
  }

  /** Fires a pointer event with coordinates, which jsdom may not copy from the init. */
  function pointer(
    type: 'pointerDown' | 'pointerMove' | 'pointerUp',
    target: Element,
    x = 0,
    y = 0
  ) {
    const event = createEvent[type](target, { clientX: x, clientY: y });
    Object.defineProperty(event, 'clientX', { value: x });
    Object.defineProperty(event, 'clientY', { value: y });
    return fireEvent(target, event);
  }

  it('has a resize handle only for a free-floating window', () => {
    renderActivity({ id: 'a', location: 'full' });

    expect(activityElement().lastElementChild).not.toHaveStyle('cursor: nwse-resize');
  });

  it('grows and shrinks with the pointer', () => {
    renderActivity({ id: 'a', location: 'window' });
    measureActivity();

    pointer('pointerDown', resizer(), 100, 100);
    pointer('pointerMove', document.body, 150, 130);
    expect(activityElement().style.width).toBe('650px');
    expect(activityElement().style.height).toBe('430px');

    pointer('pointerMove', document.body, 60, 40);
    expect(activityElement().style.width).toBe('560px');
    expect(activityElement().style.height).toBe('340px');
  });

  it('does not get smaller than the minimum size', () => {
    renderActivity({ id: 'a', location: 'window' });
    measureActivity();

    pointer('pointerDown', resizer(), 500, 500);
    pointer('pointerMove', document.body, 0, 0);

    expect(activityElement().style.width).toBe('400px');
    expect(activityElement().style.height).toBe('200px');
  });

  it('prevents the default action of the pointer-down', () => {
    renderActivity({ id: 'a', location: 'window' });
    measureActivity();

    expect(pointer('pointerDown', resizer(), 0, 0)).toBe(false);
  });

  it('turns the transition off while resizing and restores it afterwards', () => {
    renderActivity({ id: 'a', location: 'window' });
    measureActivity();
    activityElement().style.transitionDuration = '0.25s';

    pointer('pointerDown', resizer(), 0, 0);
    expect(activityElement().style.transitionDuration).toBe('0s');

    pointer('pointerUp', document.body);
    expect(activityElement().style.transitionDuration).toBe('0.25s');
  });

  it('stops following the pointer once it is released', () => {
    renderActivity({ id: 'a', location: 'window' });
    measureActivity();
    pointer('pointerDown', resizer(), 0, 0);
    pointer('pointerMove', document.body, 50, 50);
    pointer('pointerUp', document.body);

    pointer('pointerMove', document.body, 300, 300);

    expect(activityElement().style.width).toBe('650px');
    expect(activityElement().style.height).toBe('450px');
  });

  it('tells the page the size changed while resizing', () => {
    renderActivity({ id: 'a', location: 'window' });
    measureActivity();
    const onResize = vi.fn();
    window.addEventListener('resize', onResize);
    try {
      pointer('pointerDown', resizer(), 0, 0);
      pointer('pointerMove', document.body, 10, 10);

      expect(onResize).toHaveBeenCalled();
    } finally {
      window.removeEventListener('resize', onResize);
    }
  });

  it('forgets the size when the activity moves out of a window', () => {
    renderActivity({ id: 'a', location: 'window' });
    activityElement().style.width = '700px';
    activityElement().style.height = '500px';
    activityElement().style.transform = 'translate(10px, 10px)';

    act(() => {
      Activity.update('a', { location: 'split-left' });
    });

    expect(activityElement().style.width).toBe('');
    expect(activityElement().style.height).toBe('');
    expect(activityElement().style.transform).toBe('');
  });

  it('keeps the size while the activity stays a window', () => {
    renderActivity({ id: 'a', location: 'window' });
    activityElement().style.width = '700px';

    act(() => {
      Activity.update('a', { title: 'Renamed' });
    });

    expect(activityElement().style.width).toBe('700px');
  });
});

describe('Activity theme', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1920 });
  });

  afterEach(() => {
    Activity.reset();
  });

  function renderWithTheme(mode: 'light' | 'dark') {
    // A fullscreen activity has no shadow, so use a split one.
    Activity.launch({
      id: 'a',
      content: 'Some content',
      location: 'split-left',
      title: 'Some activity',
    });
    return render(
      <ThemeProvider theme={createMuiTheme({ name: mode, base: mode })}>
        <TestContext>
          <ActivitiesRenderer />
        </TestContext>
      </ThemeProvider>
    );
  }

  it('uses a light shadow in the light theme', () => {
    renderWithTheme('light');

    expect(screen.getByRole('complementary').firstElementChild).toHaveStyle(
      'box-shadow: 0px 0px 15px rgba(0,0,0,0.15)'
    );
  });

  it('uses a stronger shadow in the dark theme', () => {
    renderWithTheme('dark');

    expect(screen.getByRole('complementary').firstElementChild).toHaveStyle(
      'box-shadow: 0px 0px 15px rgba(0,0,0,0.7)'
    );
  });

  it('keeps showing the activity in the overview in both themes', () => {
    for (const mode of ['light', 'dark'] as const) {
      const view = renderWithTheme(mode);
      fireEvent.click(screen.getByLabelText('Overview'));

      expect(screen.getByRole('button', { name: /Close All/ })).toBeInTheDocument();

      view.unmount();
      Activity.reset();
    }
  });
});
