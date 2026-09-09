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

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useClusterTitleVisible } from './Chooser';

// Mutable object mutated per-test so that vi.mock's closure picks up changes.
const mockState: {
  plugins: { loaded: boolean };
  ui: { clusterChooserButtonComponent: any };
} = {
  plugins: { loaded: false },
  ui: { clusterChooserButtonComponent: undefined },
};

vi.mock('../../redux/hooks', () => ({
  useTypedSelector: (selector: any) => selector(mockState),
}));

// Chooser.tsx transitively pulls in k8s resource classes which have a circular
// dependency that breaks module initialisation in the test environment. Mock
// the modules that trigger that chain so only useClusterTitleVisible is loaded.
vi.mock('../../lib/k8s', () => ({ useClustersConf: vi.fn() }));
vi.mock('../../lib/useShortcut', () => ({ useShortcut: vi.fn() }));
vi.mock('../../helpers/recentClusters', () => ({
  getRecentClusters: vi.fn(() => []),
  setRecentCluster: vi.fn(),
}));
vi.mock('../../helpers/clusterAppearance', () => ({ getClusterAppearanceFromMeta: vi.fn() }));
vi.mock('../../helpers/isElectron', () => ({ isElectron: vi.fn(() => false) }));
vi.mock('../../lib/router/createRouteURL', () => ({ createRouteURL: vi.fn(() => '/') }));
vi.mock('../common/ActionButton', () => ({ default: () => null }));
vi.mock('../common/Dialog', () => ({ DialogTitle: () => null }));
vi.mock('../common/ErrorBoundary', () => ({ default: ({ children }: any) => children }));
vi.mock('../common/Loader', () => ({ default: () => null }));
vi.mock('./ClusterChooser', () => ({ default: () => null }));
vi.mock('./ClusterChooserPopup', () => ({ default: () => null }));
vi.mock('../App/AppLogo', () => ({ AppLogo: () => null }));

const TWO_CLUSTERS = { 'cluster-a': {} as any, 'cluster-b': {} as any };

describe('useClusterTitleVisible', () => {
  beforeEach(() => {
    mockState.plugins.loaded = false;
    mockState.ui.clusterChooserButtonComponent = undefined;
  });

  it('returns false when cluster is undefined', () => {
    mockState.plugins.loaded = true;
    const { result } = renderHook(() => useClusterTitleVisible(undefined, TWO_CLUSTERS));
    expect(result.current).toBe(false);
  });

  it('returns false when plugins are not yet loaded', () => {
    // plugins.loaded defaults to false in beforeEach
    const { result } = renderHook(() => useClusterTitleVisible('my-cluster', TWO_CLUSTERS));
    expect(result.current).toBe(false);
  });

  it('returns false when ChooserButton is explicitly null (hidden by a plugin)', () => {
    mockState.plugins.loaded = true;
    mockState.ui.clusterChooserButtonComponent = null;
    const { result } = renderHook(() => useClusterTitleVisible('my-cluster', TWO_CLUSTERS));
    expect(result.current).toBe(false);
  });

  it('returns false when there is only one cluster and no custom ChooserButton', () => {
    mockState.plugins.loaded = true;
    // clusterChooserButtonComponent is undefined — no custom button
    const { result } = renderHook(() =>
      useClusterTitleVisible('my-cluster', { 'my-cluster': {} as any })
    );
    expect(result.current).toBe(false);
  });

  it('returns false when clusters is empty and no custom ChooserButton', () => {
    mockState.plugins.loaded = true;
    const { result } = renderHook(() => useClusterTitleVisible('my-cluster', {}));
    expect(result.current).toBe(false);
  });

  it('returns true when plugins are loaded and there are multiple clusters', () => {
    mockState.plugins.loaded = true;
    const { result } = renderHook(() => useClusterTitleVisible('my-cluster', TWO_CLUSTERS));
    expect(result.current).toBe(true);
  });

  it('returns true when plugins are loaded and a custom ChooserButton is set', () => {
    mockState.plugins.loaded = true;
    mockState.ui.clusterChooserButtonComponent = () => null; // custom component
    const { result } = renderHook(() =>
      useClusterTitleVisible('my-cluster', { 'my-cluster': {} as any })
    );
    expect(result.current).toBe(true);
  });
});
