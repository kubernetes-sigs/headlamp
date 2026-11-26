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
import ReplicaSet from '../../lib/k8s/replicaSet';
import ReplicaSetList from './List';

const { mockResourceListView } = vi.hoisted(() => ({
  mockResourceListView: vi.fn(),
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockResourceListView(props);
    return null;
  },
}));

vi.mock('../common/Resource', () => ({
  MetadataDictGrid: () => null,
}));

vi.mock('react-i18next', async importOriginal => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

describe('ReplicaSetList column definitions and renderers', () => {
  beforeEach(() => {
    mockResourceListView.mockReset();
  });

  it('handles replicaset with undefined status and spec without throwing', () => {
    render(<ReplicaSetList />);

    const props = mockResourceListView.mock.calls[0][0];
    const bareReplicaSet = new ReplicaSet({
      apiVersion: 'apps/v1',
      kind: 'ReplicaSet',
      metadata: { name: 'test-replicaset', namespace: 'default' },
    } as any);

    for (const col of props.columns) {
      if (typeof col === 'object' && typeof col.getValue === 'function') {
        expect(() => col.getValue(bareReplicaSet)).not.toThrow();
      }
      if (typeof col === 'object' && typeof col.render === 'function') {
        expect(() => col.render(bareReplicaSet)).not.toThrow();
      }
    }

    const currentReplicasCol = props.columns.find((c: any) => c.id === 'currentReplicas');
    expect(currentReplicasCol.getValue(bareReplicaSet)).toBe(0);

    const desiredReplicasCol = props.columns.find((c: any) => c.id === 'desiredReplicas');
    expect(desiredReplicasCol.getValue(bareReplicaSet)).toBe(0);

    const readyReplicasCol = props.columns.find((c: any) => c.id === 'readyReplicas');
    expect(readyReplicasCol.getValue(bareReplicaSet)).toBe(0);

    const containersCol = props.columns.find((c: any) => c.id === 'containers');
    expect(containersCol.getValue(bareReplicaSet)).toBe('');

    const imagesCol = props.columns.find((c: any) => c.id === 'images');
    expect(imagesCol.getValue(bareReplicaSet)).toBe('');

    const selectorCol = props.columns.find((c: any) => c.id === 'selector');
    expect(selectorCol.getValue(bareReplicaSet)).toBe('');
    expect(selectorCol.render(bareReplicaSet)).toBeUndefined();
  });

  it('correctly displays replica counts and selector when status and spec are defined', () => {
    render(<ReplicaSetList />);

    const props = mockResourceListView.mock.calls[0][0];
    const replicaSet = new ReplicaSet({
      apiVersion: 'apps/v1',
      kind: 'ReplicaSet',
      metadata: { name: 'web-replicaset', namespace: 'default' },
      spec: {
        replicas: 3,
        selector: {
          matchLabels: { app: 'web' },
        },
        template: {
          spec: {
            containers: [{ name: 'nginx', image: 'nginx:1.23' }],
          },
        },
      },
      status: {
        replicas: 3,
        readyReplicas: 2,
      },
    } as any);

    const currentReplicasCol = props.columns.find((c: any) => c.id === 'currentReplicas');
    expect(currentReplicasCol.getValue(replicaSet)).toBe(3);

    const desiredReplicasCol = props.columns.find((c: any) => c.id === 'desiredReplicas');
    expect(desiredReplicasCol.getValue(replicaSet)).toBe(3);

    const readyReplicasCol = props.columns.find((c: any) => c.id === 'readyReplicas');
    expect(readyReplicasCol.getValue(replicaSet)).toBe(2);

    const containersCol = props.columns.find((c: any) => c.id === 'containers');
    expect(containersCol.getValue(replicaSet)).toBe('nginx');

    const imagesCol = props.columns.find((c: any) => c.id === 'images');
    expect(imagesCol.getValue(replicaSet)).toBe('nginx:1.23');

    const selectorCol = props.columns.find((c: any) => c.id === 'selector');
    expect(selectorCol.getValue(replicaSet)).toBe('app=web');
  });
});
