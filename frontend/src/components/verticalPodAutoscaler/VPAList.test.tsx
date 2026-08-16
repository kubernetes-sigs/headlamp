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

import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';

vi.mock('../../lib/k8s', () => ({
  useCluster: vi.fn(),
  useSelectedClusters: vi.fn().mockReturnValue([]),
}));

vi.mock('../../lib/k8s/vpa', () => ({
  default: {
    isEnabled: vi.fn(),
    useList: vi.fn().mockReturnValue([[], null]),
  },
}));

vi.mock('../common/SectionHeader', () => ({
  default: () => null,
  SectionHeader: () => null,
}));

vi.mock('../common', async importOriginal => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    SectionHeader: () => null,
  };
});

import { useCluster } from '../../lib/k8s';
import VPA from '../../lib/k8s/vpa';
import VpaList from './List';

describe('VpaList', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('resets to checking state immediately and discards out-of-order responses from previous clusters', async () => {
    vi.mocked(useCluster).mockReturnValue('cluster-a');
    let resolveClusterA: (value: boolean) => void;
    vi.mocked(VPA.isEnabled).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveClusterA = resolve;
        })
    );

    const { rerender } = render(
      <TestContext>
        <VpaList />
      </TestContext>
    );

    expect(screen.getByText('Checking if Vertical Pod Autoscaler is enabled…')).toBeInTheDocument();

    vi.mocked(useCluster).mockReturnValue('cluster-b');
    let resolveClusterB: (value: boolean) => void;
    vi.mocked(VPA.isEnabled).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveClusterB = resolve;
        })
    );

    rerender(
      <TestContext>
        <VpaList />
      </TestContext>
    );

    expect(screen.getByText('Checking if Vertical Pod Autoscaler is enabled…')).toBeInTheDocument();

    await act(async () => {
      resolveClusterB!(false);
    });

    await waitFor(() => {
      expect(screen.getByText(/Vertical Pod Autoscaler is not enabled/)).toBeInTheDocument();
    });

    await act(async () => {
      resolveClusterA!(true);
    });
    expect(screen.getByText(/Vertical Pod Autoscaler is not enabled/)).toBeInTheDocument();
    expect(
      screen.queryByText('Checking if Vertical Pod Autoscaler is enabled…')
    ).not.toBeInTheDocument();
  });

  it('resets to checking state on rapid A -> B -> A cluster switch when B remains pending', async () => {
    vi.mocked(useCluster).mockReturnValue('cluster-a');
    vi.mocked(VPA.isEnabled).mockResolvedValueOnce(true);

    const { rerender } = render(
      <TestContext>
        <VpaList />
      </TestContext>
    );

    await waitFor(() => {
      expect(
        screen.queryByText('Checking if Vertical Pod Autoscaler is enabled…')
      ).not.toBeInTheDocument();
    });

    vi.mocked(useCluster).mockReturnValue('cluster-b');
    let resolveClusterB: (value: boolean) => void;
    vi.mocked(VPA.isEnabled).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveClusterB = resolve;
        })
    );

    rerender(
      <TestContext>
        <VpaList />
      </TestContext>
    );

    vi.mocked(useCluster).mockReturnValue('cluster-a');
    let resolveClusterASecond: (value: boolean) => void;
    vi.mocked(VPA.isEnabled).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveClusterASecond = resolve;
        })
    );

    rerender(
      <TestContext>
        <VpaList />
      </TestContext>
    );

    expect(screen.getByText('Checking if Vertical Pod Autoscaler is enabled…')).toBeInTheDocument();

    await act(async () => {
      resolveClusterB!(false);
      resolveClusterASecond!(true);
    });
  });
});
