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
import {
  getSelectedResourcesValue,
  reconcileSelectedResources,
  serializeSelectedResources,
} from './selectedResources';

describe('selectedResources', () => {
  it('serializes selected resources without treating an empty resource list as all', () => {
    expect(getSelectedResourcesValue(new Set(), 0)).toBe('');
    expect(getSelectedResourcesValue(new Set(), undefined)).toBe('');
    expect(getSelectedResourcesValue(new Set(['v1/pods']), 1)).toBe('all');
    expect(getSelectedResourcesValue(new Set(['v1/pods']), 2)).toBe('v1/pods');
  });

  it('adds newly discovered resources while all resources are selected', () => {
    expect(
      reconcileSelectedResources(new Set(['v1/pods']), ['v1/pods', 'apps/v1/deployments'], true)
    ).toEqual(new Set(['v1/pods', 'apps/v1/deployments']));
  });

  it('preserves an explicit partial selection when discovery changes', () => {
    const selection = new Set(['v1/pods']);

    expect(reconcileSelectedResources(selection, ['v1/pods', 'apps/v1/deployments'], false)).toBe(
      selection
    );
  });

  it('removes selected resources that are no longer available', () => {
    const selection = reconcileSelectedResources(
      new Set(['v1/pods', 'custom.io/v1/widgets']),
      ['v1/pods', 'apps/v1/deployments'],
      false
    );

    expect(selection).toEqual(new Set(['v1/pods']));
    expect(serializeSelectedResources(selection!, false)).toBe('v1/pods');
  });

  it('keeps a reconciled partial selection explicit as discovery changes again', () => {
    const selection = reconcileSelectedResources(
      new Set(['v1/pods', 'custom.io/v1/widgets']),
      ['v1/pods'],
      false
    );

    expect(serializeSelectedResources(selection!, false)).toBe('v1/pods');
    expect(
      reconcileSelectedResources(selection, ['v1/pods', 'apps/v1/deployments'], false)
    ).toEqual(new Set(['v1/pods']));
  });

  it('serializes all resources only from explicit select-all intent', () => {
    const selection = new Set(['v1/pods']);

    expect(serializeSelectedResources(selection, true)).toBe('all');
    expect(serializeSelectedResources(selection, false)).toBe('v1/pods');
  });
});
