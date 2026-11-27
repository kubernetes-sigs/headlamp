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
import PersistentVolume from '../../lib/k8s/persistentVolume';
import VolumeList from './VolumeList';

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

function volume(name: string, storage?: string) {
  return new PersistentVolume({
    apiVersion: 'v1',
    kind: 'PersistentVolume',
    metadata: { name },
    spec: storage ? { capacity: { storage } } : {},
  } as any);
}

describe('VolumeList', () => {
  beforeEach(() => {
    mockResourceListView.mockReset();
  });

  it('sorts the Capacity column by size, not as text', () => {
    render(<VolumeList />);

    const props = mockResourceListView.mock.calls[0][0];
    const capacityCol = props.columns.find((c: any) => c.id === 'capacity');
    expect(capacityCol.sort).toBeTypeOf('function');

    const volumes = [
      volume('one', '1Gi'),
      volume('half', '500Mi'),
      volume('ten', '10Gi'),
      volume('two', '2Gi'),
      volume('no-capacity'),
    ];

    expect(volumes.sort(capacityCol.sort).map(v => v.metadata.name)).toEqual([
      'no-capacity',
      'half',
      'one',
      'two',
      'ten',
    ]);
  });
});
