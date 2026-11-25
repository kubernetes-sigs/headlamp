/*
 * Copyright 2026 The Kubernetes Authors
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
import React from 'react';
import store from '../../redux/stores/store';
import { TestContext } from '../../test';
import { Activity, SingleActivityRenderer } from './Activity';

describe('activity overview layout', () => {
  let main: HTMLElement;

  beforeEach(() => {
    main = document.createElement('main');
    main.id = 'main';
    document.body.appendChild(main);
    vi.spyOn(main, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 980, 1000));
  });

  afterEach(() => {
    Activity.reset();
    main.remove();
    vi.restoreAllMocks();
  });

  it('sizes previews in the overview grid and restores their normal layout when overview closes', () => {
    const activity: Activity = {
      id: 'preview',
      title: 'Preview activity',
      content: 'Activity content',
      location: 'full',
      temporary: true,
    };
    Activity.launch(activity);
    const onClick = vi.fn();
    const view = (isOverview: boolean) => (
      <TestContext>
        <SingleActivityRenderer
          activity={activity}
          index={4}
          zIndex={3}
          isOverview={isOverview}
          onClick={onClick}
        />
      </TestContext>
    );
    const { rerender } = render(view(true), { container: main });
    const panel = screen
      .getByRole('complementary', { name: 'Preview activity' })
      .querySelector<HTMLDivElement>(':scope > div')!;

    expect(panel.style.width).toBe('300px');
    expect(panel.style.height).toBe('172px');
    expect(panel.style.transform).toBe('translate(340px, 212px)');

    const pointerDown = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
    fireEvent(panel, pointerDown);
    expect(pointerDown.defaultPrevented).toBe(true);
    expect(onClick).toHaveBeenCalledOnce();
    expect(store.getState().activity.activities.preview.temporary).toBe(false);

    rerender(view(false));

    expect(panel.style.width).toBe('');
    expect(panel.style.height).toBe('');
    expect(panel.style.transform).toBe('');
    expect(screen.getByText('Activity content')).toBeVisible();
  });
});
