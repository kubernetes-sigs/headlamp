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

import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import store from '../../redux/stores/store';
import { TestContext } from '../../test';
import { ActivitiesRenderer, Activity, ACTIVITY_BASE_Z_INDEX } from './Activity';
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

describe('ActivitiesRenderer stacking order', () => {
  /**
   * z-index of the sticky resource details header, see the header Box in
   * components/common/Resource/Resource.tsx. It is the highest stacking level used by
   * page content inside `#main`, and `#main` is not a stacking context, so the activity
   * layer has to stay above it.
   */
  const PAGE_CONTENT_STICKY_HEADER_Z_INDEX = 10;

  /** Renders the activity layer in the same DOM shape the app layout uses. */
  function renderActivityLayer(activities: Activity[]) {
    const result = render(
      <TestContext>
        <div style={{ display: 'grid', position: 'relative' }}>
          <div id="main" style={{ position: 'relative' }}>
            <div
              data-testid="sticky-details-header"
              style={{ position: 'sticky', top: 0, zIndex: PAGE_CONTENT_STICKY_HEADER_Z_INDEX }}
            >
              Pod: some-pod
            </div>
          </div>
          <ActivitiesRenderer />
        </div>
      </TestContext>
    );

    // Launching an activity also schedules a resize event so its content can adjust.
    act(() => {
      activities.forEach(activity => Activity.launch(activity));
      vi.advanceTimersByTime(500);
    });

    return result;
  }

  /** z-index of the styled container of a named activity. */
  const zIndexOf = (name: string) =>
    Number(
      getComputedStyle(screen.getByRole('complementary', { name }).firstElementChild as Element)
        .zIndex
    );

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
  });

  afterEach(() => {
    act(() => {
      Activity.reset();
    });
    vi.useRealTimers();
  });

  it('keeps the base stacking level above the sticky details header', () => {
    expect(ACTIVITY_BASE_Z_INDEX).toBeGreaterThan(PAGE_CONTENT_STICKY_HEADER_Z_INDEX);
  });

  it('renders a fullscreen activity above the sticky details header', () => {
    renderActivityLayer([
      { id: 'logs-1', title: 'Logs', location: 'full', content: 'Log content' },
    ]);

    const headerZIndex = Number(
      getComputedStyle(screen.getByTestId('sticky-details-header')).zIndex
    );

    expect(headerZIndex).toBe(PAGE_CONTENT_STICKY_HEADER_Z_INDEX);
    expect(zIndexOf('Logs')).toBeGreaterThan(headerZIndex);
  });

  it('stacks later activities above earlier ones, all above page content', () => {
    renderActivityLayer([
      { id: 'logs-1', title: 'First', location: 'full', content: 'First' },
      { id: 'logs-2', title: 'Second', location: 'full', content: 'Second' },
    ]);

    expect(zIndexOf('First')).toBeGreaterThan(PAGE_CONTENT_STICKY_HEADER_Z_INDEX);
    expect(zIndexOf('Second')).toBeGreaterThan(zIndexOf('First'));
  });

  it('keeps the taskbar stacked above overlapping window-medium activities', () => {
    renderActivityLayer([
      { id: 'yaml-1', title: 'View YAML', location: 'window-medium', content: 'YAML content' },
    ]);

    const activityZIndex = zIndexOf('View YAML');
    const taskbar = screen.getByTestId('activity-bar');
    const taskbarZIndex = Number(getComputedStyle(taskbar).zIndex);

    expect(activityZIndex).toBeGreaterThan(PAGE_CONTENT_STICKY_HEADER_Z_INDEX);
    expect(taskbarZIndex).toBeGreaterThan(activityZIndex);
  });
});
