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

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import RoleBindingDetails from './BindingDetails';

const { binding, mockActivityLaunch } = vi.hoisted(() => ({
  binding: { current: {} as any },
  mockActivityLaunch: vi.fn(),
}));

// Importing the real k8s classes here runs into the lib/k8s import cycle, so only stub what
// this page imports from there.
vi.mock('../../lib/k8s', () => ({ ResourceClasses: {} }));
vi.mock('../../lib/k8s/roleBinding', () => ({ default: { kind: 'RoleBinding' } }));
vi.mock('../../lib/k8s/clusterRoleBinding', () => ({ default: { kind: 'ClusterRoleBinding' } }));

// With the details drawer on (the default), Link opens the subject through Activity.launch.
vi.mock('../activity/Activity', () => ({
  Activity: { launch: (...args: any[]) => mockActivityLaunch(...args) },
}));

// DetailsGrid normally fetches the binding. Render its extra sections for a fixed item.
vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => (
    <div>
      {props.extraSections(binding.current).map((section: any) => (
        <div key={section.id}>{section.section}</div>
      ))}
    </div>
  ),
}));

// Render the subjects table as plain cells, without the themed section and table chrome.
vi.mock('../common/SectionBox', () => ({
  SectionBox: (props: any) => <div>{props.children}</div>,
}));
vi.mock('../common/SimpleTable', () => ({
  default: (props: any) => (
    <div>
      {props.data.map((row: any, i: number) => (
        <div key={i}>
          {props.columns.map((column: any) => (
            <span key={column.label}>{column.getter(row)}</span>
          ))}
        </div>
      ))}
    </div>
  ),
}));

describe('RoleBindingDetails subject links', () => {
  const originalPath = window.location.pathname;

  beforeEach(() => {
    mockActivityLaunch.mockReset();
    // Two clusters are selected, and cluster-a comes first in the URL.
    window.history.pushState({}, '', '/c/cluster-a+cluster-b/rolebindings');
    binding.current = {
      cluster: 'cluster-b',
      subjects: [
        { kind: 'ServiceAccount', name: 'builder', namespace: 'rb-check' },
        { kind: 'User', name: 'jane', apiGroup: 'rbac.authorization.k8s.io' },
      ],
    };
    render(
      <TestContext>
        <RoleBindingDetails name="builder-binding" namespace="rb-check" cluster="cluster-b" />
      </TestContext>
    );
  });

  afterEach(() => {
    window.history.pushState({}, '', originalPath);
  });

  it("links to the subject in the binding's own cluster", () => {
    expect(screen.getByRole('link', { name: 'builder' })).toHaveAttribute(
      'href',
      '/c/cluster-b+cluster-a/serviceaccounts/rb-check/builder'
    );
  });

  it("opens the subject drawer for the binding's own cluster", () => {
    fireEvent.click(screen.getByRole('link', { name: 'builder' }));

    expect(mockActivityLaunch).toHaveBeenCalledTimes(1);
    expect(mockActivityLaunch.mock.calls[0][0]).toMatchObject({
      kind: 'details',
      cluster: 'cluster-b',
      title: 'ServiceAccount builder',
    });
  });

  it('does not link subjects that are not Kubernetes objects', () => {
    expect(screen.getByText('jane')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'jane' })).not.toBeInTheDocument();
  });
});
