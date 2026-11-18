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

import spacetime from 'spacetime';
import { describe, expect, it } from 'vitest';
import { formatOffset } from './formatOffset';

describe('formatOffset', () => {
  it.each([
    [0, '+0'],
    [9, '+9'],
    [-5, '-5'],
    [5.5, '+5:30'],
    [5.75, '+5:45'],
    [-3.5, '-3:30'],
    [-9.5, '-9:30'],
    [-0.5, '-0:30'],
    [13.75, '+13:45'],
  ])('formats %s as %s', (offset, label) => {
    expect(formatOffset(offset)).toBe(label);
  });

  // None of these zones has daylight saving time, so their offset is the same all year.
  it.each([
    ['Asia/Tokyo', '+9'],
    ['Asia/Kolkata', '+5:30'],
    ['Asia/Kathmandu', '+5:45'],
    ['Pacific/Marquesas', '-9:30'],
  ])('formats the offset spacetime gives for %s as %s', (name, label) => {
    expect(formatOffset(spacetime.now(name).timezone().current.offset)).toBe(label);
  });
});
