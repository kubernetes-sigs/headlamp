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

import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getClusterAppearanceFromMeta } from '../../helpers/clusterAppearance';
import { isElectron } from '../../helpers/isElectron';
import { getRecentClusters, setRecentCluster } from '../../helpers/recentClusters';
import { useClustersConf } from '../../lib/k8s';
import { useShortcut } from '../../lib/useShortcut';
import { TestContext } from '../../test';
import Chooser, { ClusterDialog, ClusterTitle, useClusterTitleVisible } from './Chooser';

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
vi.mock('../../helpers/clusterAppearance', () => ({
  getClusterAppearanceFromMeta: vi.fn(() => ({ icon: undefined, accentColor: undefined })),
}));
vi.mock('../../helpers/isElectron', () => ({ isElectron: vi.fn(() => false) }));
vi.mock('../../lib/router/createRouteURL', () => ({ createRouteURL: vi.fn(() => '/load') }));
vi.mock('../../lib/util', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, any>;
  return {
    ...actual,
    getCluster: vi.fn(() => null),
    getClusterPrefixedPath: vi.fn(() => '/c/:cluster'),
  };
});
vi.mock('../common/ActionButton', () => ({
  default: ({ description, onClick }: any) => (
    <button onClick={onClick} data-testid="action-button">
      {description}
    </button>
  ),
}));
vi.mock('../common/Dialog', () => ({
  DialogTitle: ({ children, buttons }: any) => (
    <div data-testid="dialog-title">
      {children}
      {buttons}
    </div>
  ),
}));
vi.mock('../common/ErrorBoundary', () => ({ default: ({ children }: any) => children }));
vi.mock('../common/Loader', () => ({
  default: ({ title }: any) => <div data-testid="loader">{title}</div>,
}));
vi.mock('./ClusterChooser', () => ({
  default: React.forwardRef(({ clickHandler, cluster }: any, ref: any) => (
    <button ref={ref} data-testid="cluster-chooser-btn" onClick={clickHandler}>
      {cluster}
    </button>
  )),
}));
vi.mock('./ClusterChooserPopup', () => ({
  default: ({ anchor, onClose }: any) =>
    anchor ? (
      <div data-testid="cluster-chooser-popup">
        <button data-testid="close-popup" onClick={onClose}>
          close
        </button>
      </div>
    ) : null,
}));
vi.mock('../App/AppLogo', () => ({ AppLogo: () => <div data-testid="app-logo" /> }));

const TWO_CLUSTERS = {
  'cluster-a': { name: 'cluster-a' } as any,
  'cluster-b': { name: 'cluster-b' } as any,
};

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

describe('ClusterTitle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.plugins.loaded = true;
    mockState.ui.clusterChooserButtonComponent = undefined;
    vi.mocked(getClusterAppearanceFromMeta).mockReturnValue({
      icon: 'mdi:kubernetes',
      accentColor: '#ff0000',
    });
  });

  it('returns null when not visible', () => {
    mockState.plugins.loaded = false;
    const { container } = render(
      <TestContext>
        <ClusterTitle cluster="cluster-a" clusters={TWO_CLUSTERS} />
      </TestContext>
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders default ClusterChooser, opens popup on click and shortcut, and closes popup', () => {
    const onClick = vi.fn();
    let shortcutCb: ((event: KeyboardEvent) => void) | undefined;
    vi.mocked(useShortcut).mockImplementation((_name, cb) => {
      shortcutCb = cb;
      return () => {};
    });

    render(
      <TestContext>
        <ClusterTitle
          cluster="cluster-a"
          clusters={TWO_CLUSTERS}
          selectedClusters={['cluster-a']}
          onClick={onClick}
        />
      </TestContext>
    );

    const btn = screen.getByTestId('cluster-chooser-btn');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalled();
    expect(screen.getByTestId('cluster-chooser-popup')).toBeTruthy();

    fireEvent.click(screen.getByTestId('close-popup'));
    expect(screen.queryByTestId('cluster-chooser-popup')).toBeNull();

    act(() => {
      shortcutCb?.(new KeyboardEvent('keydown'));
    });
    expect(screen.getByTestId('cluster-chooser-popup')).toBeTruthy();
  });

  it('renders custom ChooserButton as a React element or function component', () => {
    mockState.ui.clusterChooserButtonComponent = <div data-testid="custom-el">Custom El</div>;
    const { rerender } = render(
      <TestContext>
        <ClusterTitle cluster="cluster-a" clusters={TWO_CLUSTERS} />
      </TestContext>
    );
    expect(screen.getByTestId('custom-el')).toBeTruthy();

    const CustomComp = ({ clickHandler, cluster }: any) => (
      <button data-testid="custom-fn" onClick={clickHandler}>
        {cluster}
      </button>
    );
    mockState.ui.clusterChooserButtonComponent = CustomComp;
    const onClick = vi.fn();
    rerender(
      <TestContext>
        <ClusterTitle cluster="cluster-a" clusters={TWO_CLUSTERS} onClick={onClick} />
      </TestContext>
    );
    fireEvent.click(screen.getByTestId('custom-fn'));
    expect(onClick).toHaveBeenCalled();
    expect(screen.getByTestId('cluster-chooser-popup')).toBeTruthy();
  });
});

describe('ClusterDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles internal show state when open is undefined, and calls onClose when provided', async () => {
    const { rerender } = render(
      <TestContext>
        <ClusterDialog useCover>
          <div>Dialog body</div>
        </ClusterDialog>
      </TestContext>
    );
    expect(screen.getByText('Dialog body')).toBeTruthy();

    const infoBtn = screen.getByLabelText('Show build information');
    fireEvent.click(infoBtn);
    await waitFor(() => {
      expect(screen.queryByText('Dialog body')).toBeNull();
    });

    const onClose = vi.fn();
    rerender(
      <TestContext>
        <ClusterDialog open onClose={onClose} showInfoButton={false}>
          <div>Controlled body</div>
        </ClusterDialog>
      </TestContext>
    );
    expect(screen.getByText('Controlled body')).toBeTruthy();
    expect(screen.queryByLabelText('Show build information')).toBeNull();
  });

  it('invokes onClose when info button is clicked in controlled mode', () => {
    const onClose = vi.fn();
    render(
      <TestContext>
        <ClusterDialog open onClose={onClose}>
          <div>Body</div>
        </ClusterDialog>
      </TestContext>
    );
    fireEvent.click(screen.getByLabelText('Show build information'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Chooser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isElectron).mockReturnValue(false);
    vi.mocked(getRecentClusters).mockReturnValue([]);
    vi.mocked(getClusterAppearanceFromMeta).mockReturnValue({
      icon: undefined,
      accentColor: undefined,
    });
  });

  it('returns null when open is false', () => {
    vi.mocked(useClustersConf).mockReturnValue({});
    const { container } = render(
      <TestContext>
        <Chooser open={false} />
      </TestContext>
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders loading state when clusters is null', () => {
    vi.mocked(useClustersConf).mockReturnValue(null);
    render(
      <TestContext>
        <Chooser open />
      </TestContext>
    );
    expect(screen.getByText('Wait while fetching clusters…')).toBeTruthy();
    expect(screen.getByTestId('loader')).toBeTruthy();
  });

  it('renders empty clusters message and Electron load button when isElectron is true', () => {
    vi.mocked(useClustersConf).mockReturnValue({});
    vi.mocked(isElectron).mockReturnValue(true);
    function LocationObserver() {
      return <div data-testid="current-pathname">{useLocation().pathname}</div>;
    }
    render(
      <TestContext>
        <LocationObserver />
        <Chooser open>
          <span data-testid="child-action">Extra</span>
        </Chooser>
      </TestContext>
    );
    expect(screen.getByText('There seems to be no clusters configured…')).toBeTruthy();
    expect(screen.getByText('Or try running Headlamp with a different kube config.')).toBeTruthy();
    expect(screen.getByTestId('child-action')).toBeTruthy();
    fireEvent.click(screen.getByTestId('action-button'));
    expect(screen.getByTestId('current-pathname').textContent).toBe('/load');
  });

  it('auto-selects when there is only 1 cluster', () => {
    const onClose = vi.fn();
    vi.mocked(useClustersConf).mockReturnValue({
      only: { name: 'only' } as any,
    });
    render(
      <TestContext>
        <Chooser onClose={onClose} />
      </TestContext>
    );
    expect(vi.mocked(setRecentCluster)).toHaveBeenCalledWith({ name: 'only' });
    expect(onClose).toHaveBeenCalled();
  });

  it('renders cluster buttons for 2-3 clusters and handles click', () => {
    vi.mocked(useClustersConf).mockReturnValue(TWO_CLUSTERS);
    render(
      <TestContext>
        <Chooser open />
      </TestContext>
    );
    fireEvent.click(screen.getByText('cluster-a'));
    expect(vi.mocked(setRecentCluster)).toHaveBeenCalledWith(TWO_CLUSTERS['cluster-a']);
  });

  it('renders recent clusters and autocomplete when more than 3 clusters exist', () => {
    const manyClusters = {
      c1: { name: 'c1' } as any,
      c2: { name: 'c2' } as any,
      c3: { name: 'c3' } as any,
      c4: { name: 'c4' } as any,
      c5: { name: 'c5' } as any,
    };
    vi.mocked(useClustersConf).mockReturnValue(manyClusters);
    vi.mocked(getRecentClusters).mockReturnValue(['c4', 'nonexistent']);

    render(
      <TestContext>
        <Chooser open />
      </TestContext>
    );

    expect(screen.getByText('Recent clusters')).toBeTruthy();
    expect(screen.getByText('c4')).toBeTruthy();
    const input = screen.getByLabelText('All clusters');
    fireEvent.mouseDown(input);
    fireEvent.click(screen.getByText('c5'));
    expect(vi.mocked(setRecentCluster)).toHaveBeenCalledWith(manyClusters.c5);
  });
});
