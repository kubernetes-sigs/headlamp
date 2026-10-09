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
import { describe, expect, it, vi } from 'vitest';
import type Pod from '../../lib/k8s/pod';
import {
  getMaxContainerCpuLimitPercent,
  getMaxContainerMemoryLimitPercent,
  makePodStatusLabel,
  PodListRenderer,
} from './List';

const { mockTranslation } = vi.hoisted(() => ({
  mockTranslation: vi.fn((key: string, values?: Record<string, string>) => {
    const label = key.split('|').at(-1)!;
    return Object.entries(values ?? {}).reduce(
      (result, [name, value]) => result.replace(`{{ ${name} }}`, value),
      label
    );
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockTranslation }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../lib/k8s/pod', () => ({
  default: class Pod {},
}));

vi.mock('../../lib/k8s/PodMetrics', () => ({
  METRIC_REFETCH_INTERVAL_MS: 30_000,
  PodMetrics: class PodMetrics {},
}));

vi.mock('../common', () => ({
  CreateResourceButton: () => null,
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => (
    <>
      <div data-testid="title-side-actions">{props.headerProps?.titleSideActions}</div>
      <div data-testid="header-actions">{props.headerProps?.actions}</div>
    </>
  ),
}));

vi.mock('../common/Resource/ResourceTable', () => ({
  useThrottle: (value: unknown) => value,
}));

describe('PodListRenderer', () => {
  it('shows loaded counts and disables load more while a page is loading', async () => {
    let finishLoading!: () => void;
    const onLoadMore = vi.fn(() => new Promise<void>(resolve => (finishLoading = resolve)));

    render(
      <PodListRenderer
        pods={[{} as Pod]}
        metrics={null}
        hideCreateButton
        hasMore
        remainingItemCount={4}
        onLoadMore={onLoadMore}
      />
    );

    expect(screen.getByTestId('title-side-actions')).toBeEmptyDOMElement();
    expect(screen.getByText('1 of ~5')).toBeVisible();
    const headerActions = screen.getByTestId('header-actions');
    expect(headerActions).toContainElement(screen.getByText('1 of ~5'));

    const button = screen.getByRole('button', { name: 'Load more' });
    expect(headerActions).toContainElement(button);
    expect(mockTranslation).toHaveBeenCalledWith('glossary|Load more');

    fireEvent.click(button);

    expect(onLoadMore).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
    expect(mockTranslation).toHaveBeenCalledWith('translation|Loading...');

    finishLoading();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled());
  });
});

describe('makePodStatusLabel', () => {
  it('suppresses the supplemental OOMKilled badge when reason already reports OOMKilled', () => {
    const pod = {
      getDetailedStatus: () => ({ reason: 'OOMKilled', message: 'Container failed' }),
      status: {
        phase: 'Failed',
        containerStatuses: [
          {
            state: { terminated: { reason: 'OOMKilled' } },
          },
        ],
      },
    } as any;

    render(makePodStatusLabel(pod, false, mockTranslation as any));
    const labels = screen.getAllByText('OOMKilled');
    expect(labels).toHaveLength(1);
  });

  it('suppresses the supplemental OOMKilled badge when reason reports Init:OOMKilled', () => {
    const pod = {
      getDetailedStatus: () => ({ reason: 'Init:OOMKilled', message: 'Init container failed' }),
      status: {
        phase: 'Failed',
        initContainerStatuses: [
          {
            state: { terminated: { reason: 'OOMKilled' } },
          },
        ],
      },
    } as any;

    render(makePodStatusLabel(pod, false, mockTranslation as any));
    expect(screen.getByText('Init:OOMKilled')).toBeInTheDocument();
    expect(screen.queryByText('OOMKilled')).not.toBeInTheDocument();
  });

  it('renders supplemental OOMKilled badge when reason is CrashLoopBackOff', () => {
    const pod = {
      getDetailedStatus: () => ({ reason: 'CrashLoopBackOff', message: 'Back-off restarting' }),
      status: {
        phase: 'Running',
        containerStatuses: [
          {
            lastState: { terminated: { reason: 'OOMKilled' } },
          },
        ],
      },
    } as any;

    render(makePodStatusLabel(pod, false, mockTranslation as any));
    expect(screen.getByText('CrashLoopBackOff')).toBeInTheDocument();
    expect(screen.getByText('OOMKilled')).toBeInTheDocument();
  });

  it('renders supplemental OOMKilled badge for currently terminated container when primary reason is Running', () => {
    const pod = {
      getDetailedStatus: () => ({ reason: 'Running', message: 'Running' }),
      status: {
        phase: 'Running',
        containerStatuses: [
          {
            state: { terminated: { reason: 'OOMKilled' } },
          },
        ],
      },
    } as any;

    render(makePodStatusLabel(pod, false, mockTranslation as any));
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('OOMKilled')).toBeInTheDocument();
  });

  it('renders supplemental OOMKilled badge for ephemeral containers with OOM termination', () => {
    const pod = {
      getDetailedStatus: () => ({ reason: 'Running', message: 'Running' }),
      status: {
        phase: 'Running',
        ephemeralContainerStatuses: [
          {
            state: { terminated: { reason: 'OOMKilled' } },
          },
        ],
      },
    } as any;

    render(makePodStatusLabel(pod, false, mockTranslation as any));
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('OOMKilled')).toBeInTheDocument();
  });
});

describe('getMaxContainerCpuLimitPercent', () => {
  it('returns 0 when metric is missing or no containers have CPU limits', () => {
    const pod = {
      spec: {
        containers: [{ name: 'unlimited', resources: {} }],
      },
    } as any;
    const metric = {
      jsonData: {
        containers: [{ name: 'unlimited', usage: { cpu: '500m' } }],
      },
    } as any;

    expect(getMaxContainerCpuLimitPercent(pod, undefined)).toBe(0);
    expect(getMaxContainerCpuLimitPercent(pod, metric)).toBe(0);
  });

  it('evaluates boundary at 94.9% vs 95% CPU limit', () => {
    const pod = {
      spec: {
        containers: [{ name: 'app', resources: { limits: { cpu: '1000m' } } }],
      },
    } as any;
    const metricBelow = {
      jsonData: {
        containers: [{ name: 'app', usage: { cpu: '949m' } }],
      },
    } as any;
    const metricAt = {
      jsonData: {
        containers: [{ name: 'app', usage: { cpu: '950m' } }],
      },
    } as any;

    const pctBelow = getMaxContainerCpuLimitPercent(pod, metricBelow);
    const pctAt = getMaxContainerCpuLimitPercent(pod, metricAt);

    expect(pctBelow).toBeCloseTo(94.9, 1);
    expect(pctBelow >= 95).toBe(false);

    expect(pctAt).toBe(95);
    expect(pctAt >= 95).toBe(true);
  });

  it('computes percentage per named container and ignores unlimited container usage', () => {
    const pod = {
      spec: {
        containers: [
          { name: 'limited', resources: { limits: { cpu: '200m' } } },
          { name: 'unlimited', resources: {} },
        ],
      },
    } as any;
    const metric = {
      jsonData: {
        containers: [
          { name: 'limited', usage: { cpu: '40m' } },
          { name: 'unlimited', usage: { cpu: '800m' } },
        ],
      },
    } as any;

    // limited is 40m / 200m = 20%, unlimited is ignored
    expect(getMaxContainerCpuLimitPercent(pod, metric)).toBe(20);
  });

  it('returns highest percentage among multiple limited containers', () => {
    const pod = {
      spec: {
        containers: [
          { name: 'app', resources: { limits: { cpu: '100m' } } },
          { name: 'sidecar', resources: { limits: { cpu: '50m' } } },
        ],
      },
    } as any;
    const metric = {
      jsonData: {
        containers: [
          { name: 'app', usage: { cpu: '96m' } },
          { name: 'sidecar', usage: { cpu: '10m' } },
        ],
      },
    } as any;

    // app is 96%, sidecar is 20% -> returns 96%
    expect(getMaxContainerCpuLimitPercent(pod, metric)).toBe(96);
  });

  it('computes percentage including initContainers', () => {
    const pod = {
      spec: {
        containers: [{ name: 'app', resources: { limits: { cpu: '100m' } } }],
        initContainers: [{ name: 'init-sidecar', resources: { limits: { cpu: '50m' } } }],
      },
    } as any;
    const metric = {
      jsonData: {
        containers: [
          { name: 'app', usage: { cpu: '10m' } },
          { name: 'init-sidecar', usage: { cpu: '48m' } },
        ],
      },
    } as any;

    // app is 10%, init-sidecar is 48m / 50m = 96% -> returns 96%
    expect(getMaxContainerCpuLimitPercent(pod, metric)).toBe(96);
  });
});

describe('getMaxContainerMemoryLimitPercent', () => {
  it('returns 0 when metric is missing or no containers have memory limits', () => {
    const pod = {
      spec: {
        containers: [{ name: 'unlimited', resources: {} }],
      },
    } as any;
    const metric = {
      jsonData: {
        containers: [{ name: 'unlimited', usage: { memory: '500Mi' } }],
      },
    } as any;

    expect(getMaxContainerMemoryLimitPercent(pod, undefined)).toBe(0);
    expect(getMaxContainerMemoryLimitPercent(pod, metric)).toBe(0);
  });

  it('evaluates boundary at 74.9% vs 75% and 89.9% vs 90% memory limits', () => {
    const pod = {
      spec: {
        containers: [{ name: 'app', resources: { limits: { memory: '1000Mi' } } }],
      },
    } as any;
    const metricBelow75 = {
      jsonData: { containers: [{ name: 'app', usage: { memory: '749Mi' } }] },
    } as any;
    const metricAt75 = {
      jsonData: { containers: [{ name: 'app', usage: { memory: '750Mi' } }] },
    } as any;
    const metricBelow90 = {
      jsonData: { containers: [{ name: 'app', usage: { memory: '899Mi' } }] },
    } as any;
    const metricAt90 = {
      jsonData: { containers: [{ name: 'app', usage: { memory: '900Mi' } }] },
    } as any;

    const pctBelow75 = getMaxContainerMemoryLimitPercent(pod, metricBelow75);
    expect(pctBelow75).toBeCloseTo(74.9, 1);
    expect(pctBelow75 >= 75).toBe(false);

    const pctAt75 = getMaxContainerMemoryLimitPercent(pod, metricAt75);
    expect(pctAt75).toBe(75);
    expect(pctAt75 >= 75 && pctAt75 < 90).toBe(true);

    const pctBelow90 = getMaxContainerMemoryLimitPercent(pod, metricBelow90);
    expect(pctBelow90).toBeCloseTo(89.9, 1);
    expect(pctBelow90 >= 75 && pctBelow90 < 90).toBe(true);
    expect(pctBelow90 >= 90).toBe(false);

    const pctAt90 = getMaxContainerMemoryLimitPercent(pod, metricAt90);
    expect(pctAt90).toBe(90);
    expect(pctAt90 >= 90).toBe(true);
  });

  it('computes percentage per named container and ignores unlimited container usage', () => {
    const pod = {
      spec: {
        containers: [
          { name: 'limited', resources: { limits: { memory: '100Mi' } } },
          { name: 'unlimited', resources: {} },
        ],
      },
    } as any;
    const metric = {
      jsonData: {
        containers: [
          { name: 'limited', usage: { memory: '92Mi' } },
          { name: 'unlimited', usage: { memory: '500Mi' } },
        ],
      },
    } as any;

    // limited is 92Mi / 100Mi = 92%, unlimited is ignored
    expect(getMaxContainerMemoryLimitPercent(pod, metric)).toBe(92);
  });

  it('computes percentage including initContainers', () => {
    const pod = {
      spec: {
        containers: [{ name: 'app', resources: { limits: { memory: '100Mi' } } }],
        initContainers: [{ name: 'init-sidecar', resources: { limits: { memory: '50Mi' } } }],
      },
    } as any;
    const metric = {
      jsonData: {
        containers: [
          { name: 'app', usage: { memory: '10Mi' } },
          { name: 'init-sidecar', usage: { memory: '45Mi' } },
        ],
      },
    } as any;

    // app is 10%, init-sidecar is 45Mi / 50Mi = 90% -> returns 90%
    expect(getMaxContainerMemoryLimitPercent(pod, metric)).toBe(90);
  });
});
