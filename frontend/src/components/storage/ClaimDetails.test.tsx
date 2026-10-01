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
import { describe, expect, it, vi } from 'vitest';
import { makePVCStatusLabel } from './ClaimDetails';

const { mockPhaseLabel } = vi.hoisted(() => ({ mockPhaseLabel: vi.fn() }));

vi.mock('../../lib/k8s/persistentVolumeClaim', () => ({
  default: { kind: 'PersistentVolumeClaim' },
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: () => null,
}));

vi.mock('../common/PhaseLabel', () => ({
  PhaseLabel: (props: any) => {
    mockPhaseLabel(props);
    return null;
  },
}));

describe('makePVCStatusLabel', () => {
  it.each([
    ['Bound', 'success'],
    ['Pending', 'warning'],
    ['Lost', 'error'],
  ])('renders %s as %s', (phase, expected) => {
    mockPhaseLabel.mockClear();
    render(makePVCStatusLabel({ status: { phase } } as any));

    const props = mockPhaseLabel.mock.calls[0][0];
    expect(props.phase).toBe(phase);
    const status =
      phase === props.successPhase
        ? 'success'
        : props.warningPhases.includes(phase)
        ? 'warning'
        : 'error';
    expect(status).toBe(expected);
  });
});
