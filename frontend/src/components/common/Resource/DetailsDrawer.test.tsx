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

import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

vi.mock('../../resourceMap/details/KubeNodeDetails', () => ({
  KubeObjectDetails: () => <div data-testid="kube-object-details">details</div>,
}));

import { type DetailDrawerSide, drawerModeSlice } from '../../../redux/drawerModeSlice';
import DetailsDrawer from './DetailsDrawer';

function makeStore(side: DetailDrawerSide | undefined) {
  return configureStore({
    reducer: {
      drawerMode: drawerModeSlice.reducer,
    },
    preloadedState: {
      drawerMode: {
        isDetailDrawerEnabled: true,
        // Cast because we deliberately want to feed an out-of-band value in
        // one test to exercise the runtime fallback.
        detailDrawerSide: side as DetailDrawerSide,
        selectedResource: {
          kind: 'Pod',
          metadata: { name: 'my-pod', namespace: 'default' },
          cluster: 'cluster-a',
        },
      },
    },
  });
}

function renderWithSide(side: DetailDrawerSide | undefined) {
  const { container } = render(
    <Provider store={makeStore(side)}>
      <DetailsDrawer />
    </Provider>
  );
  const drawer = container.querySelector('[data-details-drawer="true"]') as HTMLElement | null;
  if (!drawer) throw new Error('drawer not rendered');
  return drawer;
}

// MUI resolves `sx` to injected CSS classes, not inline styles, so read the
// computed value. jsdom returns the raw value from the class rule (no layout
// resolution) which is enough to distinguish the three variants.
function styleValue(drawer: HTMLElement, prop: string) {
  return getComputedStyle(drawer).getPropertyValue(prop);
}

describe('DetailsDrawer', () => {
  it('positions the drawer on the right by default', () => {
    const drawer = renderWithSide('right');
    expect(drawer.getAttribute('data-details-drawer-side')).toBe('right');
    expect(styleValue(drawer, 'right')).toBe('0px');
    expect(styleValue(drawer, 'left')).toBe('');
    expect(styleValue(drawer, 'bottom')).toBe('');
    expect(styleValue(drawer, 'width')).toBe('60vw');
    expect(styleValue(drawer, 'height')).toBe('100%');
  });

  it('positions the drawer on the left when the side is left', () => {
    const drawer = renderWithSide('left');
    expect(drawer.getAttribute('data-details-drawer-side')).toBe('left');
    expect(styleValue(drawer, 'left')).toBe('0px');
    expect(styleValue(drawer, 'right')).toBe('');
    expect(styleValue(drawer, 'bottom')).toBe('');
    expect(styleValue(drawer, 'width')).toBe('60vw');
    expect(styleValue(drawer, 'height')).toBe('100%');
  });

  it('positions the drawer along the bottom when the side is bottom', () => {
    const drawer = renderWithSide('bottom');
    expect(drawer.getAttribute('data-details-drawer-side')).toBe('bottom');
    expect(styleValue(drawer, 'bottom')).toBe('0px');
    expect(styleValue(drawer, 'left')).toBe('0px');
    expect(styleValue(drawer, 'right')).toBe('0px');
    expect(styleValue(drawer, 'width')).toBe('100%');
    expect(styleValue(drawer, 'height')).toBe('60vh');
  });

  it('falls back to the right side when the stored value is unrecognized', () => {
    const drawer = renderWithSide('sideways' as unknown as DetailDrawerSide);
    // The reducer holds whatever value is in state (still 'sideways'), but the
    // component's `?? drawerPositionStyles.right` guard makes the rendered
    // geometry match the right variant.
    expect(styleValue(drawer, 'right')).toBe('0px');
    expect(styleValue(drawer, 'width')).toBe('60vw');
  });
});
