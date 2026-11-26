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

// Registers the app's routes, so Role and ClusterRole links can resolve their URLs.
import '../../lib/router';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import RoleList from './List';

const { mockListView, mockActivityLaunch } = vi.hoisted(() => ({
  mockListView: vi.fn(),
  mockActivityLaunch: vi.fn(),
}));

vi.mock('../../lib/k8s/role', () => ({
  default: { useList: () => ({ items: [], errors: null }) },
}));

vi.mock('../../lib/k8s/clusterRole', () => ({
  default: { useList: () => ({ items: [], errors: null }) },
}));

vi.mock('../activity/Activity', () => ({
  Activity: { launch: (...args: any[]) => mockActivityLaunch(...args) },
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockListView(props);
    return null;
  },
}));

function nameColumn() {
  render(
    <TestContext>
      <RoleList />
    </TestContext>
  );

  return mockListView.mock.calls[0][0].columns.find((c: any) => typeof c === 'object');
}

describe('RoleList name column', () => {
  const originalPath = window.location.pathname;

  beforeEach(() => {
    mockListView.mockReset();
    mockActivityLaunch.mockReset();
    // Two clusters are selected, and docker-desktop comes first in the URL.
    window.history.pushState({}, '', '/c/docker-desktop+minikube/roles');
  });

  afterEach(() => {
    window.history.pushState({}, '', originalPath);
  });

  it('links and opens a Role drawer in its own cluster via activeCluster', () => {
    const column = nameColumn();
    const role = {
      metadata: { name: 'my-role', namespace: 'default' },
      cluster: 'minikube',
    };

    render(
      <TestContext urlPrefix="/c" routerMap={{ cluster: 'docker-desktop+minikube' }}>
        {column.render(role)}
      </TestContext>
    );

    const link = screen.getByRole('link', { name: 'my-role' });
    expect(link).toHaveAttribute('href', '/c/minikube+docker-desktop/roles/default/my-role');

    fireEvent.click(link);
    expect(mockActivityLaunch).toHaveBeenCalledTimes(1);
    expect(mockActivityLaunch.mock.calls[0][0]).toMatchObject({
      kind: 'details',
      cluster: 'minikube',
    });
  });

  it('links and opens a ClusterRole drawer in its own cluster via activeCluster', () => {
    const column = nameColumn();
    const clusterRole = {
      metadata: { name: 'my-cluster-role' },
      cluster: 'minikube',
    };

    render(
      <TestContext urlPrefix="/c" routerMap={{ cluster: 'docker-desktop+minikube' }}>
        {column.render(clusterRole)}
      </TestContext>
    );

    const link = screen.getByRole('link', { name: 'my-cluster-role' });
    expect(link).toHaveAttribute('href', '/c/minikube+docker-desktop/clusterroles/my-cluster-role');

    fireEvent.click(link);
    expect(mockActivityLaunch).toHaveBeenCalledTimes(1);
    expect(mockActivityLaunch.mock.calls[0][0]).toMatchObject({
      kind: 'details',
      cluster: 'minikube',
    });
  });
});
