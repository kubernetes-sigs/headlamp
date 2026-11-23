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

import '../../i18n/config';
import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  KubeResourcePoolStatusRequest,
  PoolStatus,
  ResourcePoolStatusRequestStatus,
} from '../../lib/k8s/resourcePoolStatusRequest';
import ResourcePoolStatusRequest from '../../lib/k8s/resourcePoolStatusRequest';
import ResourceSlice from '../../lib/k8s/resourceSlice';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import PoolAvailability from './PoolAvailability';
import { RESOURCE_SLICE_DUMMY_DATA } from './storyHelper';

const { mockPost, mockRemove, mockRequest } = vi.hoisted(() => ({
  mockPost: vi.fn(),
  mockRemove: vi.fn(),
  mockRequest: vi.fn(),
}));

vi.mock('../../lib/k8s/api/v1/clusterRequests', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/k8s/api/v1/clusterRequests')>()),
  post: mockPost,
  remove: mockRemove,
  request: mockRequest,
}));

vi.mock('../../lib/k8s/api/v1/hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/k8s/api/v1/hooks')>()),
  useCluster: () => 'gpu-cluster',
}));

const driver = 'gpu.example.com';
const theme = createMuiTheme({ base: 'light', name: 'light' });

const pool = (poolName: string, counts: Partial<PoolStatus> = {}): PoolStatus => ({
  driver,
  poolName,
  generation: 1,
  nodeName: poolName,
  totalDevices: 4,
  allocatedDevices: 1,
  availableDevices: 3,
  unavailableDevices: 0,
  ...counts,
});

const answer = (status?: ResourcePoolStatusRequestStatus): KubeResourcePoolStatusRequest => ({
  apiVersion: 'resource.k8s.io/v1alpha3',
  kind: 'ResourcePoolStatusRequest',
  metadata: { name: 'headlamp-pool-status-x1', uid: 'uid', creationTimestamp: '' },
  spec: { driver },
  status,
});

const condition = (type: string, message = type) => ({
  type,
  status: 'True',
  reason: type,
  message,
  lastTransitionTime: '2026-11-21T00:00:00Z',
});

const complete = (pools: PoolStatus[], poolCount = pools.length) =>
  answer({ poolCount, pools, conditions: [condition('Complete')] });

const renderPage = (search: Record<string, string> = { driver }) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TestContext urlSearchParams={search}>
        <ThemeProvider theme={theme}>
          <PoolAvailability />
        </ThemeProvider>
      </TestContext>
    </QueryClientProvider>
  );

describe('PoolAvailability', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockRequest.mockReset();
    mockRemove.mockReset().mockResolvedValue({});
    vi.spyOn(ResourcePoolStatusRequest, 'isEnabled').mockResolvedValue(true);
    vi.spyOn(ResourceSlice, 'useList').mockReturnValue({
      items: RESOURCE_SLICE_DUMMY_DATA.map(slice => new ResourceSlice(slice, 'gpu-cluster')),
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows the devices of each of the driver's pools", async () => {
    mockPost.mockResolvedValue(
      complete([pool('worker-0'), pool('worker-1', { allocatedDevices: 4, availableDevices: 0 })])
    );

    renderPage();

    const row = (await screen.findByText('worker-1', { selector: 'td' })).closest('tr')!;
    expect([...row.querySelectorAll('td')].map(cell => cell.textContent)).toEqual([
      'worker-1',
      'worker-1',
      '0',
      '4',
      '0',
      '4',
    ]);
    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ spec: { driver } }),
      true,
      { cluster: 'gpu-cluster' }
    );
  });

  it('shows only the pool it was opened for, and all pools without asking again', async () => {
    mockPost.mockResolvedValue(complete([pool('worker-0'), pool('worker-1')]));

    renderPage({ driver, pool: 'worker-0' });

    expect(await screen.findByText('worker-0', { selector: 'td' })).toBeVisible();
    expect(screen.queryByText('worker-1', { selector: 'td' })).not.toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ spec: { driver } }),
      true,
      { cluster: 'gpu-cluster' }
    );

    await userEvent.click(screen.getByRole('button', { name: 'Show all pools' }));

    expect(await screen.findByText('worker-1', { selector: 'td' })).toBeVisible();
    expect(screen.getByText('worker-0', { selector: 'td' })).toBeVisible();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('says a pool is incomplete instead of showing zero devices', async () => {
    mockPost.mockResolvedValue(
      complete([
        pool('worker-0', {
          totalDevices: undefined,
          allocatedDevices: undefined,
          availableDevices: undefined,
          unavailableDevices: undefined,
          validationError: 'PoolIncomplete: 1 of 2 slices published',
        }),
      ])
    );

    renderPage();

    const label = await screen.findByText('Incomplete');
    expect(label).toHaveAttribute('tabindex', '0');
    expect(screen.getByLabelText('PoolIncomplete: 1 of 2 slices published')).toBeVisible();
    expect([...label.closest('tr')!.querySelectorAll('td')].map(cell => cell.textContent)).toEqual([
      'worker-0',
      'worker-0',
      'Incomplete',
      '-',
      '-',
      '-',
    ]);
  });

  it.each([
    ['all pools', { driver }],
    ['one pool', { driver, pool: 'worker-0' }],
  ])('says when the cluster left out some pools, showing %s', async (_shown, search) => {
    mockPost.mockResolvedValue(complete([pool('worker-0'), pool('worker-1')], 150));

    renderPage(search as Record<string, string>);

    expect(await screen.findByText('The cluster returned 2 of 150 pools.')).toBeVisible();
  });

  it('shows why the cluster could not calculate availability', async () => {
    mockPost.mockResolvedValue(answer({ conditions: [condition('Failed', 'Listing failed')] }));

    renderPage();

    expect(await screen.findByText('Listing failed')).toBeVisible();
  });

  it('says when the cluster is waiting for a driver to publish a pool', async () => {
    mockPost.mockResolvedValue(answer());
    mockRequest.mockResolvedValue(answer({ conditions: [condition('WaitingForPools')] }));

    renderPage();

    expect(
      await screen.findByText(
        'The driver is still publishing a pool. The cluster waits up to 15 seconds for it.',
        undefined,
        { timeout: 3_000 }
      )
    ).toBeVisible();
  });

  it('says there is no result yet when the cluster never answers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockPost.mockResolvedValue(answer());
    mockRequest.mockResolvedValue(answer());

    renderPage();
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    await act(() => vi.advanceTimersByTimeAsync(31_000));

    expect(
      await screen.findByText('No result yet, the pool may still be publishing or be incomplete.')
    ).toBeVisible();
  });

  it('says when the user is not allowed to ask', async () => {
    mockPost.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));

    renderPage();

    expect(
      await screen.findByText(
        'You are not allowed to request pool status. By default, only cluster admins can.'
      )
    ).toBeVisible();
  });

  it('asks nothing when the cluster does not serve the API', async () => {
    vi.spyOn(ResourcePoolStatusRequest, 'isEnabled').mockResolvedValue(false);

    renderPage();

    expect(
      await screen.findByText(
        'Pool availability needs the DRAResourcePoolStatus feature gate and the resource.k8s.io/v1alpha3 API.'
      )
    ).toBeVisible();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('asks for a driver before asking the cluster', async () => {
    renderPage({});

    expect(
      await screen.findByText('Pick a driver to see how many of its devices are free.')
    ).toBeVisible();
    expect(mockPost).not.toHaveBeenCalled();
  });
});
