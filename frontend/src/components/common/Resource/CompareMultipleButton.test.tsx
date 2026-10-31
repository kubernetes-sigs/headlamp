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

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { KubeObject } from '../../../lib/k8s/KubeObject';
import CompareMultipleButton, {
  canCompareResources,
  getComparisonLabel,
} from './CompareMultipleButton';

const { mockActivityClose, mockActivityLaunch, mockFetchLatestKubeObject } = vi.hoisted(() => ({
  mockActivityClose: vi.fn(),
  mockActivityLaunch: vi.fn(),
  mockFetchLatestKubeObject: vi.fn(),
}));

vi.mock('../../activity/Activity', () => ({
  Activity: {
    close: (...args: unknown[]) => mockActivityClose(...args),
    launch: (...args: unknown[]) => mockActivityLaunch(...args),
  },
}));

vi.mock('./fetchLatestKubeObject', () => ({
  fetchLatestKubeObject: (...args: unknown[]) => mockFetchLatestKubeObject(...args),
}));

vi.mock('../ActionButton', () => ({
  default: ({ onClick }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick}>Compare</button>
  ),
}));

vi.mock('./ResourceComparison', () => ({
  default: () => null,
}));

vi.mock('@iconify/react', () => ({
  Icon: () => null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function makeObject(
  name: string,
  cluster: string,
  { kind = 'Deployment', apiVersion = 'apps/v1', namespace = 'default' as string | null } = {}
) {
  const metadata = { name, namespace: namespace ?? undefined, uid: `${cluster}-${name}` };
  return { cluster, kind, metadata, jsonData: { apiVersion, kind, metadata } } as KubeObject;
}

describe('canCompareResources', () => {
  it('accepts two objects of the same kind, including from different clusters', () => {
    expect(canCompareResources([makeObject('a', 'staging'), makeObject('b', 'staging')])).toBe(
      true
    );
    expect(canCompareResources([makeObject('web', 'staging'), makeObject('web', 'prod')])).toBe(
      true
    );
  });

  it('rejects any number of objects other than two', () => {
    expect(canCompareResources([])).toBe(false);
    expect(canCompareResources([makeObject('a', 'staging')])).toBe(false);
    expect(
      canCompareResources([
        makeObject('a', 'staging'),
        makeObject('b', 'staging'),
        makeObject('c', 'staging'),
      ])
    ).toBe(false);
  });

  it('rejects objects of different kinds or apiVersions', () => {
    expect(
      canCompareResources([
        makeObject('a', 'staging'),
        makeObject('b', 'staging', { kind: 'ConfigMap', apiVersion: 'v1' }),
      ])
    ).toBe(false);
    expect(
      canCompareResources([
        makeObject('a', 'staging'),
        makeObject('b', 'staging', { apiVersion: 'apps/v1beta2' }),
      ])
    ).toBe(false);
  });
});

describe('getComparisonLabel', () => {
  it('describes an object by its cluster, namespace and name', () => {
    expect(getComparisonLabel(makeObject('web', 'prod'))).toBe('prod / default / web');
  });

  it('leaves out the namespace of cluster-scoped objects', () => {
    const clusterRole = makeObject('view', 'prod', { kind: 'ClusterRole', namespace: null });
    expect(getComparisonLabel(clusterRole)).toBe('prod / view');
  });
});

describe('CompareMultipleButton', () => {
  beforeEach(() => {
    mockActivityClose.mockReset();
    mockActivityLaunch.mockReset();
    mockFetchLatestKubeObject.mockReset();
  });

  it('opens a comparison of the latest versions of both objects', async () => {
    const staging = makeObject('web', 'staging');
    const prod = makeObject('web', 'prod');
    const latestProd = makeObject('web', 'prod');
    mockFetchLatestKubeObject.mockImplementation(async (item: KubeObject) =>
      item === prod ? latestProd : item
    );

    render(<CompareMultipleButton items={[staging, prod]} />);
    fireEvent.click(screen.getByText('Compare'));

    await waitFor(() => expect(mockActivityLaunch).toHaveBeenCalledTimes(1));
    const activity = mockActivityLaunch.mock.calls[0][0];
    expect(activity.id).toBe('compare-staging-web-prod-web');
    // Both objects are named web, so the title names it once.
    expect(activity.title).toBe('translation|Compare {{name}}');
    expect(mockActivityClose).toHaveBeenCalledWith(activity.id);
    // The two objects are in different clusters, so the activity is not tied to one.
    expect(activity.cluster).toBeUndefined();
    expect(activity.content.props).toMatchObject({
      original: staging.jsonData,
      modified: latestProd.jsonData,
      originalLabel: 'staging / default / web',
      modifiedLabel: 'prod / default / web',
    });
  });

  it('shows the cluster when both objects are in the same one', async () => {
    mockFetchLatestKubeObject.mockImplementation(async (item: KubeObject) => item);

    render(
      <CompareMultipleButton items={[makeObject('a', 'staging'), makeObject('b', 'staging')]} />
    );
    fireEvent.click(screen.getByText('Compare'));

    await waitFor(() => expect(mockActivityLaunch).toHaveBeenCalledTimes(1));
    expect(mockActivityLaunch.mock.calls[0][0].cluster).toBe('staging');
    expect(mockActivityLaunch.mock.calls[0][0].title).toBe(
      'translation|Compare {{first}} and {{second}}'
    );
  });

  it('compares the selected version when the latest one cannot be fetched', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const first = makeObject('a', 'staging');
    const second = makeObject('b', 'staging');
    mockFetchLatestKubeObject.mockRejectedValue(new Error('forbidden'));

    render(<CompareMultipleButton items={[first, second]} />);
    fireEvent.click(screen.getByText('Compare'));

    await waitFor(() => expect(mockActivityLaunch).toHaveBeenCalledTimes(1));
    expect(mockActivityLaunch.mock.calls[0][0].content.props).toMatchObject({
      original: first.jsonData,
      modified: second.jsonData,
    });
    consoleErrorSpy.mockRestore();
  });
});
