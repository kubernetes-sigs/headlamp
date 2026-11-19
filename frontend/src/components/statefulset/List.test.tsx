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
import StatefulSet from '../../lib/k8s/statefulSet';
import StatefulSetList from './List';

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

describe('StatefulSetList column definitions and renderers', () => {
  beforeEach(() => {
    mockResourceListView.mockReset();
  });

  it('handles statefulset with undefined status and spec without throwing', () => {
    render(<StatefulSetList />);

    const props = mockResourceListView.mock.calls[0][0];
    const bareStatefulSet = new StatefulSet({
      apiVersion: 'apps/v1',
      kind: 'StatefulSet',
      metadata: { name: 'test-statefulset', namespace: 'default' },
    } as any);

    for (const col of props.columns) {
      if (typeof col === 'object' && typeof col.getValue === 'function') {
        expect(() => col.getValue(bareStatefulSet)).not.toThrow();
      }
      if (typeof col === 'object' && typeof col.render === 'function') {
        expect(() => col.render(bareStatefulSet)).not.toThrow();
      }
    }

    const podsCol = props.columns.find((c: any) => c.id === 'pods');
    expect(podsCol.getValue(bareStatefulSet)).toBe('0/0');

    const replicasCol = props.columns.find((c: any) => c.id === 'replicas');
    expect(replicasCol.getValue(bareStatefulSet)).toBe(0);

    const containersCol = props.columns.find((c: any) => c.id === 'containers');
    expect(containersCol.getValue(bareStatefulSet)).toBe('');

    const imagesCol = props.columns.find((c: any) => c.id === 'images');
    expect(imagesCol.getValue(bareStatefulSet)).toBe('');
  });

  it('correctly displays replica counts when status and spec are defined', () => {
    render(<StatefulSetList />);

    const props = mockResourceListView.mock.calls[0][0];
    const statefulSet = new StatefulSet({
      apiVersion: 'apps/v1',
      kind: 'StatefulSet',
      metadata: { name: 'web-statefulset', namespace: 'default' },
      spec: {
        replicas: 3,
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

    const podsCol = props.columns.find((c: any) => c.id === 'pods');
    expect(podsCol.getValue(statefulSet)).toBe('2/3');

    const replicasCol = props.columns.find((c: any) => c.id === 'replicas');
    expect(replicasCol.getValue(statefulSet)).toBe(3);

    const containersCol = props.columns.find((c: any) => c.id === 'containers');
    expect(containersCol.getValue(statefulSet)).toBe('nginx');

    const imagesCol = props.columns.find((c: any) => c.id === 'images');
    expect(imagesCol.getValue(statefulSet)).toBe('nginx:1.23');
  });
});
