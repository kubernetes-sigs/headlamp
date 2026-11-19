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

import { fireEvent, render as testingRender, screen } from '@testing-library/react';
import { ReactNode } from 'react';
import { MemoryRouter, Route, useLocation } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { useCluster } from '../../lib/k8s';
import type { UIPanel } from '../../redux/uiSlice';
import ClusterLayout from './ClusterLayout';
import { ClusterPreOpenState, useClusterPreOpen } from './useClusterPreOpen';

vi.mock('../../lib/k8s', () => ({
  useCluster: vi.fn(() => 'test-cluster'),
}));

vi.mock('./useClusterPreOpen', () => ({
  useClusterPreOpen: vi.fn(),
}));

vi.mock('../common/AlertNotification', () => ({
  default: () => <div>health-poller</div>,
}));

import ClusterPreOpenGate from './ClusterPreOpenGate';

function render(children: ReactNode) {
  return testingRender(children, {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={['/c/test-cluster/pods']}>{children}</MemoryRouter>
    ),
  });
}

function LocationDisplay() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

const readyState: ClusterPreOpenState = {
  enabled: true,
  isSuccess: true,
  isError: false,
  error: null,
  message: undefined,
  retry: vi.fn(),
};
const sidebarClusterRequest = vi.fn();
const topBarUserInfoRequest = vi.fn();
const panelClusterRequest = vi.fn();

function TopBarWithUserInfoRequest() {
  topBarUserInfoRequest();
  return <div>top-bar</div>;
}

function SidebarWithClusterRequest() {
  sidebarClusterRequest();
  return <div>sidebar</div>;
}

function PanelWithClusterRequest() {
  panelClusterRequest();
  return <div>cluster-panel</div>;
}

const panels = {
  top: [{ id: 'top', side: 'top', component: PanelWithClusterRequest }],
  right: [{ id: 'right', side: 'right', component: PanelWithClusterRequest }],
  bottom: [{ id: 'bottom', side: 'bottom', component: PanelWithClusterRequest }],
  left: [{ id: 'left', side: 'left', component: PanelWithClusterRequest }],
} as Record<UIPanel['side'], UIPanel[]>;

beforeEach(() => {
  sidebarClusterRequest.mockClear();
  topBarUserInfoRequest.mockClear();
  panelClusterRequest.mockClear();
  vi.mocked(useCluster).mockReturnValue('test-cluster');
  vi.mocked(useClusterPreOpen).mockReturnValue(readyState);
});

it('does not mount plugin UI panels while preparation is pending', () => {
  vi.mocked(useClusterPreOpen).mockReturnValue({ ...readyState, isSuccess: false });

  render(
    <ClusterLayout panels={panels}>
      <div>cluster-content</div>
    </ClusterLayout>
  );

  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(panelClusterRequest).not.toHaveBeenCalled();
  expect(screen.queryByText('cluster-panel')).not.toBeInTheDocument();
  expect(screen.queryByText('cluster-content')).not.toBeInTheDocument();
});

it('does not mount cluster polling or namespace resolution while preparation is pending', () => {
  vi.mocked(useClusterPreOpen).mockReturnValue({ ...readyState, isSuccess: false });

  render(
    <ClusterPreOpenGate>
      <TopBarWithUserInfoRequest />
      <SidebarWithClusterRequest />
      <div>namespace-selector</div>
    </ClusterPreOpenGate>
  );

  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(topBarUserInfoRequest).not.toHaveBeenCalled();
  expect(screen.queryByText('top-bar')).not.toBeInTheDocument();
  expect(sidebarClusterRequest).not.toHaveBeenCalled();
  expect(screen.queryByText('sidebar')).not.toBeInTheDocument();
  expect(screen.queryByText('health-poller')).not.toBeInTheDocument();
  expect(screen.queryByText('namespace-selector')).not.toBeInTheDocument();
});

it('does not mount health polling after cluster preparation rejects', () => {
  vi.mocked(useClusterPreOpen).mockReturnValue({
    ...readyState,
    isSuccess: false,
    isError: true,
    error: new Error('proxy failed'),
  });

  render(
    <ClusterPreOpenGate>
      <div>cluster-content</div>
    </ClusterPreOpenGate>
  );

  expect(screen.getByText('proxy failed')).toBeInTheDocument();
  expect(screen.queryByText('health-poller')).not.toBeInTheDocument();
  expect(screen.queryByText('cluster-content')).not.toBeInTheDocument();
});

it('focuses retry after cluster preparation rejects', () => {
  vi.mocked(useClusterPreOpen).mockReturnValue({
    ...readyState,
    isSuccess: false,
    isError: true,
    error: new Error('proxy failed'),
  });

  render(
    <ClusterPreOpenGate>
      <div>cluster-content</div>
    </ClusterPreOpenGate>
  );

  expect(screen.getByRole('button', { name: /Retry$/ })).toHaveFocus();
});

it.each([false, true])('can leave preparation for Home (failed: %s)', isError => {
  vi.mocked(useClusterPreOpen).mockReturnValue({
    ...readyState,
    isSuccess: false,
    isError,
    error: isError ? new Error('proxy failed') : null,
  });

  render(
    <>
      <Route path="/c/:cluster">
        <ClusterPreOpenGate>
          <div>cluster-content</div>
        </ClusterPreOpenGate>
      </Route>
      <LocationDisplay />
    </>
  );

  const back = screen.getByRole('link', { name: 'Back to clusters' });
  expect(back).toHaveAttribute('href', '/');
  fireEvent.click(back);

  expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
});

it('keeps multiline diagnostics and actions outside the error heading', () => {
  const detail = 'Proxy exited with code 1\nstderr: could not connect';
  const retry = vi.fn();
  vi.mocked(useClusterPreOpen).mockReturnValue({
    ...readyState,
    isSuccess: false,
    isError: true,
    error: new Error(detail),
    retry,
  });

  render(
    <ClusterPreOpenGate>
      <div>cluster-content</div>
    </ClusterPreOpenGate>
  );

  const heading = screen.getByRole('heading', { name: 'Could not open cluster' });
  expect(heading.tagName).toBe('H1');
  const diagnostic = screen.getByText((_text, element) => element?.textContent === detail);
  expect(diagnostic).toHaveStyle({ whiteSpace: 'pre-wrap' });
  expect(diagnostic.closest('h1, h2')).toBeNull();
  const retryButton = screen.getByRole('button', { name: 'Retry' });
  expect(retryButton.closest('h1, h2')).toBeNull();
  expect(retryButton).toHaveFocus();
  fireEvent.click(retryButton);
  expect(retry).toHaveBeenCalledOnce();
});

it('mounts only its children after cluster preparation succeeds', () => {
  render(
    <ClusterPreOpenGate>
      <div>namespace-selector</div>
    </ClusterPreOpenGate>
  );

  expect(screen.getByText('namespace-selector')).toBeInTheDocument();
  expect(screen.queryByText('health-poller')).not.toBeInTheDocument();
});
