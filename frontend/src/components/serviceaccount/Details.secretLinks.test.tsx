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
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/k8s/api/v2/ApiError';
import { getDefaultRoutes, setDefaultRoutes } from '../../lib/router/getDefaultRoutes';
import { TestContext } from '../../test';
import ServiceAccountDetails from './Details';

const { serviceAccount, mockActivityLaunch, roleList, clusterRoleList } = vi.hoisted(() => ({
  serviceAccount: { current: {} as any },
  mockActivityLaunch: vi.fn(),
  roleList: vi.fn(),
  clusterRoleList: vi.fn(),
}));

// Importing the real k8s classes here runs into the lib/k8s import cycle, so only stub what
// this page imports from there.
vi.mock('../../lib/k8s', () => ({ ResourceClasses: {}, useSelectedClusters: () => ['cluster-b'] }));
vi.mock('../../lib/k8s/serviceAccount', () => ({ default: { kind: 'ServiceAccount' } }));
vi.mock('../../lib/k8s/roleBinding', () => ({ default: { useList: roleList } }));
vi.mock('../../lib/k8s/clusterRoleBinding', () => ({ default: { useList: clusterRoleList } }));

vi.mock('../common/SectionBox', () => {
  const SectionBox = ({ children }: PropsWithChildren) => <>{children}</>;
  return { default: SectionBox, SectionBox };
});

vi.mock('../common/SimpleTable', () => ({
  default: ({
    data,
    errorMessage,
  }: {
    data: { metadata: { name: string } }[] | null;
    errorMessage?: string;
  }) => (
    <div>
      {data?.map(item => (
        <span key={item.metadata.name}>{item.metadata.name}</span>
      ))}
      {errorMessage}
    </div>
  ),
}));

// With the details drawer on (the default), Link opens the Secret through Activity.launch.
vi.mock('../activity/Activity', () => ({
  Activity: { launch: (...args: any[]) => mockActivityLaunch(...args) },
}));

// DetailsGrid normally fetches the ServiceAccount. Render its extra info rows for a fixed item.
vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => (
    <div>
      {props.extraInfo(serviceAccount.current).map((row: any) => (
        <div key={row.name}>{row.value}</div>
      ))}
      {props.extraSections(serviceAccount.current).map((section: any) => (
        <div key={section.id}>{section.section}</div>
      ))}
    </div>
  ),
}));

describe('ServiceAccountDetails secret links', () => {
  const originalPath = window.location.pathname;
  let originalRoutes: ReturnType<typeof getDefaultRoutes>;
  let view: ReturnType<typeof render>;

  beforeEach(() => {
    originalRoutes = { ...getDefaultRoutes() };
    setDefaultRoutes({
      ...originalRoutes,
      secret: {
        path: '/secrets/:namespace/:name',
        sidebar: 'secrets',
        component: () => null,
      },
    });
    mockActivityLaunch.mockReset();
    roleList.mockReset().mockReturnValue({ items: [] });
    clusterRoleList.mockReset().mockReturnValue({ items: [] });
    // Two clusters are selected, and cluster-a comes first in the URL.
    window.history.pushState({}, '', '/c/cluster-a+cluster-b/serviceaccounts');
    serviceAccount.current = {
      cluster: 'cluster-b',
      metadata: { name: 'builder', namespace: 'sa-check' },
      secrets: [{ name: 'builder-token' }],
      imagePullSecrets: [{ name: 'registry' }],
    };
    view = render(
      <TestContext>
        <ServiceAccountDetails name="builder" namespace="sa-check" cluster="cluster-b" />
      </TestContext>
    );
  });

  it.each(['namespaced', 'cluster'])(
    'retains cached %s bindings and reports failed recovery LISTs',
    kind => {
      const list = kind === 'namespaced' ? roleList : clusterRoleList;
      list.mockReturnValue({
        items: [
          {
            metadata: { name: 'cached-binding', namespace: 'sa-check' },
            subjects: [{ kind: 'ServiceAccount', name: 'builder', namespace: 'sa-check' }],
          },
        ],
        isLoading: false,
        isError: true,
        errors: [new ApiError('Binding recovery forbidden', { status: 403 })],
        watchErrors: [],
      });
      view.rerender(
        <TestContext>
          <ServiceAccountDetails name="builder" namespace="sa-check" cluster="cluster-b" />
        </TestContext>
      );
      expect(screen.getByText('cached-binding')).toBeVisible();
      expect(screen.getByRole('alert')).toHaveTextContent(
        "You don't have permissions to view this resource"
      );
    }
  );

  afterEach(() => {
    setDefaultRoutes(originalRoutes);
    window.history.pushState({}, '', originalPath);
  });

  it("link to the secrets in the ServiceAccount's own cluster", () => {
    expect(screen.getByRole('link', { name: 'builder-token' })).toHaveAttribute(
      'href',
      '/c/cluster-b+cluster-a/secrets/sa-check/builder-token'
    );
    expect(screen.getByRole('link', { name: 'registry' })).toHaveAttribute(
      'href',
      '/c/cluster-b+cluster-a/secrets/sa-check/registry'
    );
  });

  it("open the secret drawer for the ServiceAccount's own cluster", () => {
    fireEvent.click(screen.getByRole('link', { name: 'registry' }));

    expect(mockActivityLaunch).toHaveBeenCalledTimes(1);
    expect(mockActivityLaunch.mock.calls[0][0]).toMatchObject({
      kind: 'details',
      cluster: 'cluster-b',
      title: 'secret registry',
    });
  });
});
