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
import type { KubeObjectInterface } from './KubeObject';
import {
  computePatchOperations,
  computeRawPatchCount,
  normalizeBaselineForPatch,
} from './patchUtils';

const mockHPA: KubeObjectInterface = {
  apiVersion: 'autoscaling/v2',
  kind: 'HorizontalPodAutoscaler',
  metadata: {
    name: 'my-hpa',
    namespace: 'default',
    creationTimestamp: '2024-01-01T00:00:00Z',
    resourceVersion: '1000',
    uid: 'hpa-uid-123',
  },
  spec: {
    scaleTargetRef: {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      name: 'my-deployment',
    },
    minReplicas: 1,
    maxReplicas: 10,
  },
  status: {
    currentReplicas: 3,
  },
};

describe('computePatchOperations', () => {
  it('returns operations for changed fields', () => {
    const modified = {
      ...mockHPA,
      spec: { ...mockHPA.spec, minReplicas: 2, maxReplicas: 20 },
    };

    const ops = computePatchOperations(mockHPA, modified);

    expect(ops).toContainEqual({ op: 'replace', path: '/spec/minReplicas', value: 2 });
    expect(ops).toContainEqual({ op: 'replace', path: '/spec/maxReplicas', value: 20 });
    expect(ops).toHaveLength(2);
  });

  it('filters out resourceVersion changes', () => {
    const modified = {
      ...mockHPA,
      metadata: { ...mockHPA.metadata, resourceVersion: '9999' },
      spec: { ...mockHPA.spec, minReplicas: 5 },
    };

    const ops = computePatchOperations(mockHPA, modified);

    expect(ops.some(op => op.path === '/metadata/resourceVersion')).toBe(false);
    expect(ops).toContainEqual({ op: 'replace', path: '/spec/minReplicas', value: 5 });
    expect(ops).toHaveLength(1);
  });

  it('returns empty array when there are no changes', () => {
    expect(computePatchOperations(mockHPA, { ...mockHPA })).toHaveLength(0);
  });

  it('returns empty array when only resourceVersion differs', () => {
    const modified = {
      ...mockHPA,
      metadata: { ...mockHPA.metadata, resourceVersion: '9999' },
    };
    expect(computePatchOperations(mockHPA, modified)).toHaveLength(0);
  });

  it('handles field deletion', () => {
    const original = {
      ...mockHPA,
      metadata: { ...mockHPA.metadata, annotations: { 'my-annotation': 'value' } },
    };

    const ops = computePatchOperations(original, mockHPA);

    expect(ops).toContainEqual({ op: 'remove', path: '/metadata/annotations' });
  });

  it('handles field addition', () => {
    const modified = {
      ...mockHPA,
      metadata: { ...mockHPA.metadata, labels: { app: 'test' } },
    };

    const ops = computePatchOperations(mockHPA, modified);

    expect(ops).toContainEqual({ op: 'add', path: '/metadata/labels', value: { app: 'test' } });
  });

  it('filters out status changes', () => {
    const modified = {
      ...mockHPA,
      spec: { ...mockHPA.spec, minReplicas: 3 },
      status: { currentReplicas: 99 },
    };

    const ops = computePatchOperations(mockHPA, modified);

    expect(ops.some(op => op.path.startsWith('/status'))).toBe(false);
    expect(ops).toContainEqual({ op: 'replace', path: '/spec/minReplicas', value: 3 });
    expect(ops).toHaveLength(1);
  });

  it('filters out full status replacement', () => {
    const original = { ...mockHPA };
    const modified = {
      ...mockHPA,
      status: { currentReplicas: 99, desiredReplicas: 10 },
      spec: { ...mockHPA.spec, minReplicas: 5 },
    };

    const ops = computePatchOperations(original, modified);

    expect(ops.some(op => op.path === '/status' || op.path.startsWith('/status/'))).toBe(false);
    expect(ops).toContainEqual({ op: 'replace', path: '/spec/minReplicas', value: 5 });
  });

  it('filters out managedFields removal', () => {
    const original = {
      ...mockHPA,
      metadata: {
        ...mockHPA.metadata,
        managedFields: [
          {
            manager: 'kubectl',
            operation: 'Update',
            apiVersion: 'autoscaling/v2',
            fieldsType: 'FieldsV1',
            fieldsV1: {},
            subresource: '',
            timestamp: '2024-01-01T00:00:00Z',
          },
        ],
      },
    };
    const modified = {
      ...mockHPA,
      spec: { ...mockHPA.spec, minReplicas: 3 },
    };

    const ops = computePatchOperations(original, modified);

    expect(
      ops.some(
        op =>
          op.path === '/metadata/managedFields' || op.path.startsWith('/metadata/managedFields/')
      )
    ).toBe(false);
    expect(ops).toContainEqual({ op: 'replace', path: '/spec/minReplicas', value: 3 });
    expect(ops).toHaveLength(1);
  });

  it('filters out managedFields changes', () => {
    const original = {
      ...mockHPA,
      metadata: {
        ...mockHPA.metadata,
        managedFields: [
          {
            manager: 'kubectl',
            operation: 'Update',
            apiVersion: 'autoscaling/v2',
            fieldsType: 'FieldsV1',
            fieldsV1: {},
            subresource: '',
            timestamp: '2024-01-01T00:00:00Z',
          },
        ],
      },
    };
    const modified = {
      ...mockHPA,
      metadata: {
        ...mockHPA.metadata,
        managedFields: [
          {
            manager: 'helm',
            operation: 'Apply',
            apiVersion: 'autoscaling/v2',
            fieldsType: 'FieldsV1',
            fieldsV1: {},
            subresource: '',
            timestamp: '2024-01-02T00:00:00Z',
          },
        ],
      },
    };

    const ops = computePatchOperations(original, modified);

    expect(
      ops.some(
        op =>
          op.path === '/metadata/managedFields' || op.path.startsWith('/metadata/managedFields/')
      )
    ).toBe(false);
    expect(ops).toHaveLength(0);
  });

  it('filters out generation changes', () => {
    const original = {
      ...mockHPA,
      metadata: { ...mockHPA.metadata, generation: 1 },
    };
    const modified = {
      ...mockHPA,
      metadata: { ...mockHPA.metadata, generation: 5 },
      spec: { ...mockHPA.spec, minReplicas: 3 },
    };

    const ops = computePatchOperations(original, modified);

    expect(ops.some(op => op.path === '/metadata/generation')).toBe(false);
    expect(ops).toContainEqual({ op: 'replace', path: '/spec/minReplicas', value: 3 });
    expect(ops).toHaveLength(1);
  });
});

describe('KubeObject.patchUpdate filtering signal', () => {
  // patchUpdate() in KubeObject.ts uses (rawCount > 0 && filteredOps.length === 0)
  // to detect "user changed something but it was all server-managed" and reject.
  // These tests pin that signal so callers don't accidentally reintroduce silent
  // no-op edits to status/managedFields/etc.

  it('signals filtered-only no-op when only server-managed fields change', () => {
    const modified = {
      ...mockHPA,
      status: { currentReplicas: 99 },
      metadata: { ...mockHPA.metadata, resourceVersion: '2000' },
    };

    const filteredOps = computePatchOperations(mockHPA, modified);
    const rawCount = computeRawPatchCount(mockHPA, modified);

    expect(filteredOps.length).toBe(0);
    expect(rawCount).toBeGreaterThan(0);
  });

  it('signals true no-op when nothing changed', () => {
    const filteredOps = computePatchOperations(mockHPA, { ...mockHPA });
    const rawCount = computeRawPatchCount(mockHPA, { ...mockHPA });

    expect(filteredOps.length).toBe(0);
    expect(rawCount).toBe(0);
  });

  it('treats managedFields-only differences as a true no-op', () => {
    // EditorDialog hides managedFields by default, so an "open + save
    // without changes" produces a diff where the only op is the removal
    // of /metadata/managedFields. That must read as a true no-op, not a
    // filtered-only edit attempt, otherwise patchUpdate would surface a
    // bogus error to the user.
    const original = {
      ...mockHPA,
      metadata: {
        ...mockHPA.metadata,
        managedFields: [
          {
            manager: 'kubectl',
            operation: 'Update',
            apiVersion: 'autoscaling/v2',
            fieldsType: 'FieldsV1',
            fieldsV1: {},
            subresource: '',
            timestamp: '2024-01-01T00:00:00Z',
          },
        ],
      },
    };
    const modified = { ...mockHPA };

    const filteredOps = computePatchOperations(original, modified);
    const rawCount = computeRawPatchCount(original, modified);

    expect(filteredOps.length).toBe(0);
    expect(rawCount).toBe(0);
  });
});

describe('normalizeBaselineForPatch', () => {
  it('removes metadata.managedFields', () => {
    const input = {
      ...mockHPA,
      metadata: {
        ...mockHPA.metadata,
        managedFields: [
          {
            manager: 'kubectl',
            operation: 'Update',
            apiVersion: 'autoscaling/v2',
            fieldsType: 'FieldsV1',
            fieldsV1: {},
            subresource: '',
            timestamp: '2024-01-01T00:00:00Z',
          },
        ],
      },
    };

    const normalized = normalizeBaselineForPatch(input);

    expect((normalized.metadata as { managedFields?: unknown }).managedFields).toBeUndefined();
  });

  it('does not mutate the input object', () => {
    const input = {
      ...mockHPA,
      metadata: {
        ...mockHPA.metadata,
        managedFields: [
          {
            manager: 'kubectl',
            operation: 'Update',
            apiVersion: 'autoscaling/v2',
            fieldsType: 'FieldsV1',
            fieldsV1: {},
            subresource: '',
            timestamp: '2024-01-01T00:00:00Z',
          },
        ],
      },
    };

    normalizeBaselineForPatch(input);

    expect((input.metadata as { managedFields?: unknown[] }).managedFields).toBeDefined();
  });

  it('is a no-op when managedFields is already absent', () => {
    const normalized = normalizeBaselineForPatch(mockHPA);
    expect(normalized).toEqual(mockHPA);
  });
});
