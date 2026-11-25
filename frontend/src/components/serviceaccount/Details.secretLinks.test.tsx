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
import ServiceAccountDetails from './Details';

const { serviceAccount, mockActivityLaunch } = vi.hoisted(() => ({
  serviceAccount: { current: {} as any },
  mockActivityLaunch: vi.fn(),
}));

// Importing the real k8s classes here runs into the lib/k8s import cycle, so only stub what
// this page imports from there.
vi.mock('../../lib/k8s', () => ({ ResourceClasses: {} }));
vi.mock('../../lib/k8s/serviceAccount', () => ({ default: { kind: 'ServiceAccount' } }));
vi.mock('../../lib/k8s/roleBinding', () => ({ default: {} }));
vi.mock('../../lib/k8s/clusterRoleBinding', () => ({ default: {} }));

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
    </div>
  ),
}));

describe('ServiceAccountDetails secret links', () => {
  const originalPath = window.location.pathname;

  beforeEach(() => {
    mockActivityLaunch.mockReset();
    // Two clusters are selected, and cluster-a comes first in the URL.
    window.history.pushState({}, '', '/c/cluster-a+cluster-b/serviceaccounts');
    serviceAccount.current = {
      cluster: 'cluster-b',
      secrets: [{ name: 'builder-token' }],
      imagePullSecrets: [{ name: 'registry' }],
    };
    render(
      <TestContext>
        <ServiceAccountDetails name="builder" namespace="sa-check" cluster="cluster-b" />
      </TestContext>
    );
  });

  afterEach(() => {
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
