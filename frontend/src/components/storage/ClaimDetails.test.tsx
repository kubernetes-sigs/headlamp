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
import VolumeClaimDetails from './ClaimDetails';

const { mockDetailsGrid } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
}));

vi.mock('../common/Link', () => ({
  default: ({ children }: any) => children,
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    return null;
  },
}));

const pvc = {
  spec: { volumeName: 'pv-1', storageClassName: 'standard' },
  status: { phase: 'Bound' },
} as any;

function rows(item: any) {
  const props = mockDetailsGrid.mock.calls[0][0];
  return Object.fromEntries(
    props.extraInfo(item).map((f: any) => [String(f.name).split('|').pop(), f])
  );
}

describe('VolumeClaimDetails', () => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-pvc' }}>
        <VolumeClaimDetails />
      </TestContext>
    );
  });

  it('hides the volume attributes class rows when none is set', () => {
    const r = rows(pvc);

    expect(r['Volume Attributes Class'].hide).toBe(true);
    expect(r['Current Volume Attributes Class'].hide).toBe(true);
    expect(r['Volume Attributes Class Change'].hide).toBe(true);
  });

  it('shows the requested class, and the current one only while it differs', () => {
    const settled = rows({
      ...pvc,
      spec: { ...pvc.spec, volumeAttributesClassName: 'gold' },
      status: { ...pvc.status, currentVolumeAttributesClassName: 'gold' },
    });
    expect(settled['Volume Attributes Class'].hide).toBe(false);
    expect(settled['Current Volume Attributes Class'].hide).toBe(true);

    const switching = rows({
      ...pvc,
      spec: { ...pvc.spec, volumeAttributesClassName: 'gold' },
      status: { ...pvc.status, currentVolumeAttributesClassName: 'silver' },
    });
    expect(switching['Current Volume Attributes Class'].hide).toBe(false);
    expect(switching['Current Volume Attributes Class'].value).toBe('silver');
  });

  it('shows a pending change of class with its status', () => {
    const r = rows({
      ...pvc,
      status: {
        ...pvc.status,
        modifyVolumeStatus: { targetVolumeAttributesClassName: 'gold', status: 'Infeasible' },
      },
    });

    expect(r['Volume Attributes Class Change'].hide).toBe(false);
    expect(r['Volume Attributes Class Change'].value).toBe('gold (Infeasible)');
  });
});
