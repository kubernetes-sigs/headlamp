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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import CronJobDetails from './Details';

const OWNER_CLUSTER = 'owner-cluster';

const { mockApply, capturedAction, mockUseGet } = vi.hoisted(() => ({
  mockApply: vi.fn().mockResolvedValue({}),
  capturedAction: { current: null as null | (() => Promise<void>) },
  mockUseGet: vi.fn(),
}));

vi.mock('../../lib/k8s/api/v1/apply', () => ({ apply: mockApply }));

vi.mock('../../lib/k8s/cronJob', () => ({
  default: { kind: 'CronJob', useGet: mockUseGet },
}));

vi.mock('../../lib/k8s/job', () => ({
  default: {
    kind: 'Job',
    useList: () => ({ items: [], errors: null, isLoading: false }),
  },
}));

vi.mock('../../redux/clusterActionSlice', async importOriginal => ({
  ...(await importOriginal<typeof import('../../redux/clusterActionSlice')>()),
  clusterAction: vi.fn((action: () => Promise<void>) => {
    capturedAction.current = action;
    return { type: 'clusterAction/test' };
  }),
}));

vi.mock('react-i18next', async importOriginal => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

// Render only the action buttons; the rest of the details view is irrelevant here.
vi.mock('../common/Resource', () => ({
  DetailsGrid: ({ actions }: { actions: React.ReactNode[] }) => <div>{actions}</div>,
}));

vi.mock('../common/Resource/AuthVisible', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../job/List', () => ({ JobsListRenderer: () => null }));

// Only the two schedule formatters are used, and the details grid is stubbed out
// above; importing the real list module drags in an unrelated module cycle.
vi.mock('./List', () => ({
  getSchedule: () => '',
  getLastScheduleTime: () => '',
}));

function makeCronJob() {
  const jsonData = {
    kind: 'CronJob',
    apiVersion: 'batch/v1',
    metadata: {
      name: 'test-cronjob',
      namespace: 'default',
      uid: 'cronjob-uid-1',
    },
    spec: {
      schedule: '0 0 1 1 *',
      suspend: false,
      jobTemplate: {
        spec: {
          template: {
            spec: {
              restartPolicy: 'Never',
              containers: [{ name: 'hello', image: 'busybox:1.36' }],
            },
          },
        },
      },
    },
  };

  return {
    ...jsonData,
    jsonData,
    // The cluster the CronJob was actually loaded from. getCluster() would report
    // whatever the URL says, which is not necessarily this one.
    cluster: OWNER_CLUSTER,
    getName: () => jsonData.metadata.name,
    getNamespace: () => jsonData.metadata.namespace,
  };
}

describe('CronJobDetails: Spawn Job', () => {
  beforeEach(() => {
    capturedAction.current = null;
    mockApply.mockClear();
    mockUseGet.mockReturnValue([makeCronJob(), null]);
  });

  it('applies the Job to the cluster owning the CronJob', async () => {
    render(
      <TestContext>
        <CronJobDetails name="test-cronjob" namespace="default" cluster={OWNER_CLUSTER} />
      </TestContext>
    );

    fireEvent.click(screen.getByLabelText('translation|Spawn Job'));
    fireEvent.click(screen.getByRole('button', { name: 'translation|Spawn' }));

    // clusterAction defers the callback by CLUSTER_ACTION_GRACE_PERIOD, so the
    // cluster has to be resolved before then rather than inside apply().
    expect(capturedAction.current).not.toBeNull();
    await capturedAction.current!();

    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(mockApply.mock.calls[0][1]).toBe(OWNER_CLUSTER);
  });

  it('passes the cluster prop through when fetching the CronJob', () => {
    render(
      <TestContext>
        <CronJobDetails name="test-cronjob" namespace="default" cluster={OWNER_CLUSTER} />
      </TestContext>
    );

    expect(mockUseGet).toHaveBeenCalledWith('test-cronjob', 'default', {
      cluster: OWNER_CLUSTER,
    });
  });
});
