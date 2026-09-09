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
import { TestContext } from '../../test';
import StorageClassDetails from './ClassDetails';

const { mockDetailsGrid } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
}));

vi.mock('../../lib/k8s/storageClass', () => ({
  default: { kind: 'StorageClass' },
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    return null;
  },
  MetadataDictGrid: () => null,
}));

const storageClass = {
  provisioner: 'csi.test',
  reclaimPolicy: 'Delete',
  volumeBindingMode: 'Immediate',
  isDefault: true,
  allowVolumeExpansion: true,
  parameters: { type: 'gp2' },
  mountOptions: ['noatime'],
} as any;

describe('StorageClassDetails', () => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
  });

  it('passes the route name and withEvents to DetailsGrid', () => {
    render(
      <TestContext routerMap={{ name: 'standard' }}>
        <StorageClassDetails />
      </TestContext>
    );

    expect(mockDetailsGrid).toHaveBeenCalled();
    const props = mockDetailsGrid.mock.calls[0][0];
    expect(props.name).toBe('standard');
    expect(props.withEvents).toBe(true);
  });

  it('maps the storage class fields into extraInfo', () => {
    render(
      <TestContext routerMap={{ name: 'standard' }}>
        <StorageClassDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const byName = Object.fromEntries(props.extraInfo(storageClass).map((f: any) => [f.name, f]));

    expect(byName['Provisioner'].value).toBe('csi.test');
    expect(byName['Reclaim Policy'].value).toBe('Delete');
    expect(byName['Binding Mode'].value).toBe('Immediate');
    expect(byName['Default'].value).toContain('Yes');
    expect(byName['Allow Volume Expansion'].value).toContain('Yes');
  });

  it('hides Parameters and Mount Options when empty', () => {
    const bare = {
      ...storageClass,
      allowVolumeExpansion: undefined,
      parameters: {},
      mountOptions: [],
    };

    render(
      <TestContext routerMap={{ name: 'standard' }}>
        <StorageClassDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const byName = Object.fromEntries(props.extraInfo(bare).map((f: any) => [f.name, f]));

    expect(byName['Allow Volume Expansion'].hide).toBe(true);
    expect(byName['Parameters'].hide).toBe(true);
    expect(byName['Mount Options'].hide).toBeTruthy();
  });
});
