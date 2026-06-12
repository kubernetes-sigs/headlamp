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

import { describe, expect, it, vi } from 'vitest';

// Mock the K8s modules to avoid circular import issues in the test environment
vi.mock('../../lib/k8s/event', () => ({ default: {} }));
vi.mock('../../lib/k8s/node', () => ({ default: {} }));

import { hasAKSManagedNodes, isUpgradeDetected } from './upgradeDetection';
import { buildNodeUpgradeStates } from './upgradeState';

// ---------------------------------------------------------------------------
// Helpers to create minimal mock objects matching the shapes the functions use
// ---------------------------------------------------------------------------

function makeNode(
  name: string,
  opts: { providerID?: string; labels?: Record<string, string> } = {}
) {
  return {
    metadata: { name, labels: opts.labels || {} },
    jsonData: { spec: { providerID: opts.providerID || '' } },
  } as any;
}

function makeEvent(
  overrides: {
    reason?: string;
    message?: string;
    type?: string;
    nodeName?: string;
    creationTimestamp?: string;
  } = {}
) {
  const ts = overrides.creationTimestamp || '2025-01-01T00:00:00Z';
  return {
    reason: overrides.reason || '',
    message: overrides.message || '',
    type: overrides.type || 'Normal',
    involvedObject: { kind: 'Node', name: overrides.nodeName || 'node-1' },
    metadata: { creationTimestamp: ts },
    firstOccurrence: ts,
  } as any;
}

// ---------------------------------------------------------------------------
// hasAKSManagedNodes
// ---------------------------------------------------------------------------

describe('hasAKSManagedNodes', () => {
  it('returns false for an empty node array', () => {
    expect(hasAKSManagedNodes([])).toBe(false);
  });

  it('detects AKS node via providerID starting with azure://', () => {
    const nodes = [makeNode('node-1', { providerID: 'azure:///subscriptions/123/...' })];
    expect(hasAKSManagedNodes(nodes)).toBe(true);
  });

  it('detects AKS node via kubernetes.azure.com/cluster label', () => {
    const nodes = [
      makeNode('node-1', { labels: { 'kubernetes.azure.com/cluster': 'my-cluster' } }),
    ];
    expect(hasAKSManagedNodes(nodes)).toBe(true);
  });

  it('returns false for non-AKS nodes', () => {
    const nodes = [
      makeNode('ip-10-0-1-1.ec2.internal', { providerID: 'aws:///us-east-1/i-abc' }),
      makeNode('gke-pool-1234', { labels: { 'cloud.google.com/gke-nodepool': 'default' } }),
    ];
    expect(hasAKSManagedNodes(nodes)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isUpgradeDetected
// ---------------------------------------------------------------------------

describe('isUpgradeDetected', () => {
  it('returns false for an empty event array', () => {
    expect(isUpgradeDetected([])).toBe(false);
  });

  it('detects "Upgrade started for agent pool" event', () => {
    const events = [
      makeEvent({ reason: 'Upgrade', message: 'Upgrade started for agent pool default' }),
    ];
    expect(isUpgradeDetected(events)).toBe(true);
  });

  it('detects "Created a surge node" event', () => {
    const events = [
      makeEvent({ reason: 'Surge', message: 'Created a surge node aks-nodepool1-surge' }),
    ];
    expect(isUpgradeDetected(events)).toBe(true);
  });

  it('detects "Successfully reimaged node" event', () => {
    const events = [
      makeEvent({ reason: 'Upgrade', message: 'Successfully reimaged node aks-nodepool1-0' }),
    ];
    expect(isUpgradeDetected(events)).toBe(true);
  });

  it('returns false for unrelated events', () => {
    const events = [
      makeEvent({ reason: 'Scheduled', message: 'Successfully assigned pod to node' }),
      makeEvent({ reason: 'Pulling', message: 'Pulling image nginx:latest' }),
    ];
    expect(isUpgradeDetected(events)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildNodeUpgradeStates
// ---------------------------------------------------------------------------

describe('buildNodeUpgradeStates', () => {
  it('initializes all nodes with default state', () => {
    const nodes = [makeNode('node-1'), makeNode('node-2')];
    const result = buildNodeUpgradeStates(nodes, []);

    expect(result.size).toBe(2);
    const state = result.get('node-1')!;
    expect(state.isUpgrading).toBe(false);
    expect(state.isSurge).toBe(false);
    expect(state.currentStage).toBeNull();
    expect(state.failedStage).toBeNull();
    expect(state.failureMessage).toBeNull();
  });

  it('tracks full upgrade lifecycle: cordon → drain → delete → reimage → completed', () => {
    const nodes = [makeNode('node-1')];
    const events = [
      makeEvent({
        reason: 'Cordon',
        message: 'Cordoning node node-1',
        nodeName: 'node-1',
        creationTimestamp: '2025-01-01T00:01:00Z',
      }),
      makeEvent({
        reason: 'Drain',
        message: 'Draining node node-1',
        nodeName: 'node-1',
        creationTimestamp: '2025-01-01T00:02:00Z',
      }),
      makeEvent({
        reason: 'Upgrade',
        message: 'Deleting node node-1 from API server',
        nodeName: 'node-1',
        creationTimestamp: '2025-01-01T00:03:00Z',
      }),
      makeEvent({
        reason: 'Upgrade',
        message: 'Reimaging node node-1',
        nodeName: 'node-1',
        creationTimestamp: '2025-01-01T00:04:00Z',
      }),
      makeEvent({
        reason: 'Upgrade',
        message: 'Successfully upgraded node node-1',
        nodeName: 'node-1',
        creationTimestamp: '2025-01-01T00:05:00Z',
      }),
    ];

    const result = buildNodeUpgradeStates(nodes, events);
    const state = result.get('node-1')!;

    expect(state.isUpgrading).toBe(true);
    expect(state.currentStage).toBe('completed');
    expect(state.failedStage).toBeNull();
    expect(state.stageTimestamps.cordon).toBe('2025-01-01T00:01:00Z');
    expect(state.stageTimestamps.drain).toBe('2025-01-01T00:02:00Z');
    expect(state.stageTimestamps.deleteNode).toBe('2025-01-01T00:03:00Z');
    expect(state.stageTimestamps.reimage).toBe('2025-01-01T00:04:00Z');
    expect(state.stageTimestamps.completed).toBe('2025-01-01T00:05:00Z');
  });

  it('does not change state once completed (immutable)', () => {
    const nodes = [makeNode('node-1')];
    const events = [
      makeEvent({
        reason: 'Upgrade',
        message: 'Successfully upgraded node node-1',
        nodeName: 'node-1',
        creationTimestamp: '2025-01-01T00:01:00Z',
      }),
      makeEvent({
        reason: 'Cordon',
        message: 'Cordoning node node-1',
        nodeName: 'node-1',
        creationTimestamp: '2025-01-01T00:02:00Z',
      }),
    ];

    const result = buildNodeUpgradeStates(nodes, events);
    const state = result.get('node-1')!;

    expect(state.currentStage).toBe('completed');
    expect(state.stageTimestamps.cordon).toBeUndefined();
  });

  it('detects surge nodes', () => {
    const nodes = [makeNode('node-1')];
    const events = [
      makeEvent({
        reason: 'Surge',
        message: 'Created a surge node node-1',
        nodeName: 'node-1',
        creationTimestamp: '2025-01-01T00:01:00Z',
      }),
    ];

    const result = buildNodeUpgradeStates(nodes, events);
    expect(result.get('node-1')!.isSurge).toBe(true);
  });

  it('creates entries for unknown nodes from events', () => {
    const nodes = [makeNode('node-1')];
    const events = [
      makeEvent({
        reason: 'Cordon',
        message: 'Cordoning node unknown-node',
        nodeName: 'unknown-node',
        creationTimestamp: '2025-01-01T00:01:00Z',
      }),
    ];

    const result = buildNodeUpgradeStates(nodes, events);
    expect(result.has('unknown-node')).toBe(true);
    expect(result.get('unknown-node')!.currentStage).toBe('cordon');
  });

  describe('failure paths', () => {
    it('sets failedStage for cordon Warning', () => {
      const nodes = [makeNode('node-1')];
      const events = [
        makeEvent({
          reason: 'Cordon',
          message: 'Failed to cordon node node-1',
          type: 'Warning',
          nodeName: 'node-1',
        }),
      ];

      const result = buildNodeUpgradeStates(nodes, events);
      const state = result.get('node-1')!;
      expect(state.failedStage).toBe('cordon');
      expect(state.failureMessage).toContain('Failed to cordon');
      expect(state.isUpgrading).toBe(true);
      expect(state.currentStage).toBe('cordon');
    });

    it('sets failedStage for drain Warning', () => {
      const nodes = [makeNode('node-1')];
      const events = [
        makeEvent({
          reason: 'Drain',
          message: 'Error draining node node-1',
          type: 'Warning',
          nodeName: 'node-1',
        }),
      ];

      const result = buildNodeUpgradeStates(nodes, events);
      const state = result.get('node-1')!;
      expect(state.failedStage).toBe('drain');
      expect(state.isUpgrading).toBe(true);
      expect(state.currentStage).toBe('drain');
    });

    it('sets failedStage for delete Warning', () => {
      const nodes = [makeNode('node-1')];
      const events = [
        makeEvent({
          reason: 'Upgrade',
          message: 'Unable to delete node node-1',
          type: 'Warning',
          nodeName: 'node-1',
        }),
      ];

      const result = buildNodeUpgradeStates(nodes, events);
      const state = result.get('node-1')!;
      expect(state.failedStage).toBe('deleteNode');
      expect(state.isUpgrading).toBe(true);
      expect(state.currentStage).toBe('deleteNode');
    });

    it('sets failedStage for reimage Warning', () => {
      const nodes = [makeNode('node-1')];
      const events = [
        makeEvent({
          reason: 'Upgrade',
          message: 'Failed to reimage node node-1',
          type: 'Warning',
          nodeName: 'node-1',
        }),
      ];

      const result = buildNodeUpgradeStates(nodes, events);
      const state = result.get('node-1')!;
      expect(state.failedStage).toBe('reimage');
      expect(state.isUpgrading).toBe(true);
      expect(state.currentStage).toBe('reimage');
    });
  });
});
