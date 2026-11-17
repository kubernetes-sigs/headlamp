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

import { ThemeProvider } from '@mui/material/styles';
import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import Pod from '../../lib/k8s/pod';
import ResourceClaim from '../../lib/k8s/resourceClaim';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import ResourceClaimAllocatedDevices from './ResourceClaimAllocatedDevices';
import ResourceClaimConsumers from './ResourceClaimConsumers';
import { DEVICE_HEALTH_POD, RESOURCE_CLAIM_DUMMY_DATA } from './storyHelper';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const theme = createMuiTheme({ base: 'light', name: 'light' });

const renderInContext = (ui: ReactElement) =>
  render(
    <TestContext>
      <ThemeProvider theme={theme}>{ui}</ThemeProvider>
    </TestContext>
  );

const cluster = 'gpu-cluster';
const [pendingClaim, sharedClaim, fallbackClaim, trainerClaim] = RESOURCE_CLAIM_DUMMY_DATA.map(
  claim => new ResourceClaim(claim, cluster)
);

/** Serves the given Pods by name, keeps loading when null, and fails for any other Pod. */
const mockPods = (pods: Pod[] | null, isError = false) =>
  vi.spyOn(Pod, 'useGet').mockImplementation(((name: string) => {
    if (isError) {
      return [null, { status: 403, message: 'forbidden' }];
    }
    if (pods === null) {
      return [null, null];
    }
    const pod = pods.find(pod => pod.getName() === name);
    return pod ? [pod, null] : [null, { status: 404, message: 'not found' }];
  }) as any);

const healthLabels = () =>
  screen.queryAllByText(/^(Healthy|Unhealthy|Unknown)$/).map(label => label.textContent);

describe('ResourceClaimAllocatedDevices', () => {
  beforeEach(() => {
    mockPods([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists each granted device with its pool and driver', () => {
    renderInContext(<ResourceClaimAllocatedDevices claim={sharedClaim} />);

    const row = screen.getByText('gpu-5').closest('tr')!;
    expect(within(row).getByText('gpu')).toBeVisible();
    expect(within(row).getByText('gpu.example.com')).toBeVisible();
    expect(screen.queryByText('Chosen Alternative')).not.toBeInTheDocument();
  });

  it('names the alternative the scheduler chose from a prioritized list', () => {
    renderInContext(<ResourceClaimAllocatedDevices claim={fallbackClaim} />);

    const row = screen.getByText('gpu-6').closest('tr')!;
    expect(within(row).getByText('gpu')).toBeVisible();
    expect(within(row).getByText('small')).toBeVisible();
    expect(screen.getByText('Chosen Alternative')).toBeVisible();
  });

  it('says that a pending claim has no devices yet', () => {
    renderInContext(<ResourceClaimAllocatedDevices claim={pendingClaim} />);

    expect(screen.getByRole('status')).toHaveTextContent('No devices are allocated yet.');
  });

  it('shows the health the consuming Pod reports for each device', () => {
    mockPods([new Pod(DEVICE_HEALTH_POD)]);

    renderInContext(<ResourceClaimAllocatedDevices claim={trainerClaim} />);

    expect(healthLabels()).toEqual(['Healthy', 'Unhealthy']);
    expect(screen.getByLabelText('ECC error count exceeded threshold')).toBeVisible();
  });

  it('lets the keyboard reach a health label that has a message', () => {
    mockPods([new Pod(DEVICE_HEALTH_POD)]);

    renderInContext(<ResourceClaimAllocatedDevices claim={trainerClaim} />);

    expect(screen.getByLabelText('ECC error count exceeded threshold')).toHaveAttribute(
      'tabindex',
      '0'
    );
    expect(screen.getByText('Healthy')).not.toHaveAttribute('tabindex');
  });

  it('fetches only the Pods the claim is reserved for', () => {
    const useGet = mockPods([new Pod(DEVICE_HEALTH_POD)]);
    const useList = vi.spyOn(Pod, 'useList');

    renderInContext(<ResourceClaimAllocatedDevices claim={trainerClaim} />);

    expect(new Set(useGet.mock.calls.map(([name]) => name))).toEqual(new Set(['trainer-2']));
    expect(useGet).toHaveBeenCalledWith('trainer-2', 'default', { cluster });
    expect(useList).not.toHaveBeenCalled();
  });

  it('fetches no Pods when the claim has no devices', () => {
    const useGet = mockPods([]);

    renderInContext(<ResourceClaimAllocatedDevices claim={pendingClaim} />);

    expect(useGet).not.toHaveBeenCalled();
  });

  it('shows Unknown when no Pod reports the health', () => {
    renderInContext(<ResourceClaimAllocatedDevices claim={sharedClaim} />);

    expect(healthLabels()).toEqual(['Unknown']);
  });

  it('ignores Pods the claim is not reserved for', () => {
    mockPods([
      new Pod({ ...DEVICE_HEALTH_POD, metadata: { ...DEVICE_HEALTH_POD.metadata, uid: 'other' } }),
    ]);

    renderInContext(<ResourceClaimAllocatedDevices claim={trainerClaim} />);

    expect(healthLabels()).toEqual(['Unknown', 'Unknown']);
  });

  it('shows no health until the Pods are loaded', () => {
    mockPods(null);

    renderInContext(<ResourceClaimAllocatedDevices claim={trainerClaim} />);

    expect(screen.getByText('gpu-3')).toBeVisible();
    expect(healthLabels()).toEqual([]);
  });

  it('shows Unknown when the Pods cannot be read', () => {
    mockPods(null, true);

    renderInContext(<ResourceClaimAllocatedDevices claim={trainerClaim} />);

    expect(healthLabels()).toEqual(['Unknown', 'Unknown']);
  });
});

describe('ResourceClaimConsumers', () => {
  it('links every Pod reserved for the claim to its page', () => {
    renderInContext(<ResourceClaimConsumers claim={sharedClaim} />);

    for (const pod of ['trainer-0', 'trainer-1']) {
      expect(screen.getByRole('link', { name: pod })).toHaveAttribute(
        'href',
        `/c/${cluster}/pods/default/${pod}`
      );
    }
  });

  it('shows a consumer of another resource without a link', () => {
    const claim = new ResourceClaim(
      {
        ...RESOURCE_CLAIM_DUMMY_DATA[1],
        status: {
          ...RESOURCE_CLAIM_DUMMY_DATA[1].status,
          reservedFor: [
            { apiGroup: 'batch.example.com', resource: 'trainers', name: 'run-1', uid: 'u' },
          ],
        },
      },
      cluster
    );
    renderInContext(<ResourceClaimConsumers claim={claim} />);

    expect(screen.getByText('trainers.batch.example.com')).toBeVisible();
    expect(screen.getByText('run-1')).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('says that nothing uses a pending claim', () => {
    renderInContext(<ResourceClaimConsumers claim={pendingClaim} />);

    expect(screen.getByRole('status')).toHaveTextContent('Nothing uses this claim yet.');
  });
});
