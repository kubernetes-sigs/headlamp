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

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DaemonSet from '../../lib/k8s/daemonSet';
import DaemonSetList from './List';

const { mockResourceListView } = vi.hoisted(() => ({
  mockResourceListView: vi.fn(),
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockResourceListView(props);
    return null;
  },
}));

vi.mock('react-i18next', async importOriginal => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

describe('DaemonSetList', () => {
  beforeEach(() => {
    mockResourceListView.mockReset();
  });

  it('displays numberReady/desiredNumberScheduled in the Pods column', () => {
    render(<DaemonSetList />);

    const props = mockResourceListView.mock.calls[0][0];
    const podsCol = props.columns.find((c: any) => c.id === 'pods');

    const unreadyDaemonSet = new DaemonSet({
      apiVersion: 'apps/v1',
      kind: 'DaemonSet',
      metadata: { name: 'kube-proxy', namespace: 'kube-system' },
      status: {
        currentNumberScheduled: 1,
        desiredNumberScheduled: 1,
        numberReady: 0,
      },
    } as any);

    const readyDaemonSet = new DaemonSet({
      apiVersion: 'apps/v1',
      kind: 'DaemonSet',
      metadata: { name: 'coredns', namespace: 'kube-system' },
      status: {
        currentNumberScheduled: 2,
        desiredNumberScheduled: 2,
        numberReady: 2,
      },
    } as any);

    expect(podsCol.getValue(unreadyDaemonSet)).toBe('0/1');
    expect(podsCol.getValue(readyDaemonSet)).toBe('2/2');
  });

  it('handles a DaemonSet without status without throwing', () => {
    render(<DaemonSetList />);

    const props = mockResourceListView.mock.calls[0][0];
    const podsCol = props.columns.find((c: any) => c.id === 'pods');
    const bareDaemonSet = new DaemonSet({
      apiVersion: 'apps/v1',
      kind: 'DaemonSet',
      metadata: { name: 'bare-ds', namespace: 'default' },
    } as any);

    expect(podsCol.getValue(bareDaemonSet)).toBe('0/0');
  });
});
