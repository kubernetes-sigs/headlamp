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

import { render, screen } from '@testing-library/react';
import { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import PersistentVolume from '../../lib/k8s/persistentVolume';
import PersistentVolumeClaim from '../../lib/k8s/persistentVolumeClaim';
import { StatusLabel, StatusLabelProps } from '../common/Label';
import { makePVCStatusLabel } from './ClaimDetails';
import { makePVStatusLabel } from './VolumeDetails';

function expectPhaseStatus(
  label: ReactElement,
  phase: string,
  expectedStatus: StatusLabelProps['status']
) {
  render(
    <>
      {label}
      <StatusLabel status={expectedStatus}>Expected</StatusLabel>
    </>
  );

  const actualColor = getComputedStyle(screen.getByText(phase)).backgroundColor;
  const expectedColor = getComputedStyle(screen.getByText('Expected')).backgroundColor;
  expect(actualColor).toBe(expectedColor);
  expect(actualColor).not.toBe('rgba(0, 0, 0, 0)');
}

describe('storage status labels', () => {
  it.each([
    ['Pending', 'warning'],
    ['Bound', 'success'],
    ['Lost', 'error'],
  ])('renders PVC %s as %s', (phase, expectedStatus) => {
    const label = makePVCStatusLabel({ status: { phase } } as PersistentVolumeClaim);

    expectPhaseStatus(label, phase, expectedStatus as StatusLabelProps['status']);
  });

  it.each([
    ['Pending', 'warning'],
    ['Available', 'warning'],
    ['Bound', 'success'],
    ['Released', 'warning'],
    ['Failed', 'error'],
  ])('renders PV %s as %s', (phase, expectedStatus) => {
    const label = makePVStatusLabel({ status: { phase } } as PersistentVolume);

    expectPhaseStatus(label, phase, expectedStatus as StatusLabelProps['status']);
  });
});
