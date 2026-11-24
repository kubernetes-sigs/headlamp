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

import { describe, expect, it } from 'vitest';
import { ConditionLike, getTopCondition, isConditionTrue } from './conditions';

const condition = (type: string, status: string): ConditionLike => ({ type, status });

describe('isConditionTrue', () => {
  it('reports a condition present with status True as met', () => {
    expect(isConditionTrue([condition('Available', 'True')], 'Available')).toBe(true);
  });

  it('does not report False or Unknown as met', () => {
    expect(isConditionTrue([condition('Available', 'False')], 'Available')).toBe(false);
    expect(isConditionTrue([condition('Available', 'Unknown')], 'Available')).toBe(false);
  });

  it('does not report a missing condition as met', () => {
    expect(isConditionTrue([condition('Progressing', 'True')], 'Available')).toBe(false);
  });

  it('matches the condition type exactly', () => {
    expect(isConditionTrue([condition('available', 'True')], 'Available')).toBe(false);
  });

  it('handles resources with no conditions', () => {
    expect(isConditionTrue([], 'Available')).toBe(false);
    expect(isConditionTrue(undefined, 'Available')).toBe(false);
    expect(isConditionTrue(null, 'Available')).toBe(false);
  });
});

describe('getTopCondition', () => {
  const priority = ['UpdateInProgress', 'Progressing', 'Available'];

  it('returns the only met condition', () => {
    expect(getTopCondition([condition('Available', 'True')], priority)).toBe('Available');
  });

  it('returns the highest priority condition when several are met', () => {
    const conditions = [
      condition('Available', 'True'),
      condition('UpdateInProgress', 'True'),
      condition('Progressing', 'True'),
    ];

    expect(getTopCondition(conditions, priority)).toBe('UpdateInProgress');
  });

  it('picks by priority rather than by position', () => {
    // Reversing the input must not change the answer, which is the point of
    // having an explicit priority: `status.conditions` has no stable order.
    const conditions = [condition('Progressing', 'True'), condition('Available', 'True')];

    expect(getTopCondition(conditions, priority)).toBe('Progressing');
    expect(getTopCondition([...conditions].reverse(), priority)).toBe('Progressing');
  });

  it('ignores conditions that are not met, whatever their priority', () => {
    const conditions = [
      condition('UpdateInProgress', 'False'),
      condition('Progressing', 'Unknown'),
      condition('Available', 'True'),
    ];

    expect(getTopCondition(conditions, priority)).toBe('Available');
  });

  it('falls back to a met condition missing from the priority list', () => {
    expect(getTopCondition([condition('Upgrading', 'True')], priority)).toBe('Upgrading');
  });

  it('prefers any prioritised condition over an unprioritised one', () => {
    const conditions = [condition('Upgrading', 'True'), condition('Available', 'True')];

    expect(getTopCondition(conditions, priority)).toBe('Available');
  });

  it('returns undefined when nothing is met, leaving the fallback to the caller', () => {
    expect(getTopCondition([condition('Available', 'False')], priority)).toBeUndefined();
    expect(getTopCondition([], priority)).toBeUndefined();
    expect(getTopCondition(undefined, priority)).toBeUndefined();
    expect(getTopCondition(null, priority)).toBeUndefined();
  });
});
