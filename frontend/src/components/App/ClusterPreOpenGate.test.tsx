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
    <ClusterLayout pluginsLoaded panels={panels}>
      <div>cluster-content</div>
    </ClusterLayout>
  );

  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(panelClusterRequest).not.toHaveBeenCalled();
  expect(screen.queryByText('cluster-panel')).not.toBeInTheDocument();
  expect(screen.queryByText('cluster-content')).not.toBeInTheDocument();
});

it('does not mount plugin UI panels before plugins finish loading', () => {
  vi.mocked(useClusterPreOpen).mockReturnValue({ ...readyState, isSuccess: false });

  render(
    <ClusterLayout pluginsLoaded={false} panels={panels}>
      <div>cluster-content</div>
    </ClusterLayout>
  );

  expect(panelClusterRequest).not.toHaveBeenCalled();
  expect(screen.queryByText('cluster-panel')).not.toBeInTheDocument();
  expect(screen.queryByText('cluster-content')).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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

it('mounts namespace resolution after cluster preparation succeeds', () => {
  render(
    <ClusterPreOpenGate>
      <div>namespace-selector</div>
    </ClusterPreOpenGate>
  );

  expect(screen.getByText('namespace-selector')).toBeInTheDocument();
  expect(screen.getByText('health-poller')).toBeInTheDocument();
});
