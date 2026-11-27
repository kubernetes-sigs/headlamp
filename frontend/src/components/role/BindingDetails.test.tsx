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

import '../../lib/router';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import RoleBindingDetails from './BindingDetails';

const { mockDetailsGrid, mockActivityLaunch } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
  mockActivityLaunch: vi.fn(),
}));

vi.mock('../../lib/k8s/roleBinding', () => ({
  default: { kind: 'RoleBinding' },
}));

vi.mock('../../lib/k8s/clusterRoleBinding', () => ({
  default: { kind: 'ClusterRoleBinding' },
}));

vi.mock('../activity/Activity', () => ({
  Activity: { launch: (...args: any[]) => mockActivityLaunch(...args) },
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    return null;
  },
}));

vi.mock('../common/SectionBox', () => ({
  SectionBox: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('../common/SimpleTable', () => ({
  default: ({ data, columns }: any) => (
    <div>
      {(data ?? []).map((row: any, i: number) => (
        <div key={i}>
          {columns.map((col: any, j: number) => (
            <div key={j}>{col.getter ? col.getter(row) : row[col.datum]}</div>
          ))}
        </div>
      ))}
    </div>
  ),
}));

describe('RoleBindingDetails', () => {
  const originalPath = window.location.pathname;

  beforeEach(() => {
    mockDetailsGrid.mockReset();
    mockActivityLaunch.mockReset();
    window.history.pushState({}, '', '/c/docker-desktop+minikube/rolebindings');
  });

  afterEach(() => {
    window.history.pushState({}, '', originalPath);
  });

  it('links and opens subject ServiceAccount in the binding cluster via activeCluster', () => {
    render(
      <TestContext urlPrefix="/c" routerMap={{ cluster: 'docker-desktop+minikube' }}>
        <RoleBindingDetails name="my-binding" namespace="default" />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const binding = {
      cluster: 'minikube',
      roleRef: { kind: 'Role', name: 'my-role', apiGroup: 'rbac.authorization.k8s.io' },
      subjects: [
        { kind: 'ServiceAccount', name: 'builder', namespace: 'ci' },
        { kind: 'User', name: 'jane', apiGroup: 'rbac.authorization.k8s.io' },
      ],
    };

    const sections = props.extraSections(binding);
    render(
      <TestContext urlPrefix="/c" routerMap={{ cluster: 'docker-desktop+minikube' }}>
        {sections[0].section}
      </TestContext>
    );

    const saLink = screen.getByRole('link', { name: 'builder' });
    expect(saLink).toHaveAttribute('href', '/c/minikube+docker-desktop/serviceaccounts/ci/builder');

    fireEvent.click(saLink);
    expect(mockActivityLaunch).toHaveBeenCalledTimes(1);
    expect(mockActivityLaunch.mock.calls[0][0]).toMatchObject({
      kind: 'details',
      cluster: 'minikube',
    });

    expect(screen.getByText('jane')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'jane' })).not.toBeInTheDocument();
  });

  it('does not throw when subjects or roleRef are omitted', () => {
    render(
      <TestContext>
        <RoleBindingDetails name="empty-binding" namespace="default" />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const binding = { cluster: 'minikube' };

    expect(() => props.extraInfo(binding)).not.toThrow();
    const sections = props.extraSections(binding);
    expect(sections[0].section.props.children.props.data).toEqual([]);
  });
});
