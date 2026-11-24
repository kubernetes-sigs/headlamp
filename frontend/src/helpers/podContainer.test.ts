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

import type Pod from '../lib/k8s/pod';
import { getAllContainers, getDefaultContainer, resolveContainerName } from './podContainer';

/**
 * Builds a minimal Pod-like fixture. The helpers under test only touch
 * `spec.containers`, `spec.initContainers`, `spec.ephemeralContainers`,
 * `status.containerStatuses`, and `status.initContainerStatuses`, so a full
 * KubeObject is unnecessary.
 */
function makePod(parts: {
  containers?: Array<{ name: string }>;
  initContainers?: Array<{ name: string }>;
  ephemeralContainers?: Array<{ name: string }>;
  containerStatuses?: Array<{ name: string; state?: { running?: object } }>;
  initContainerStatuses?: Array<{ name: string; state?: { running?: object } }>;
}): Pod {
  return {
    spec: {
      containers: parts.containers,
      initContainers: parts.initContainers,
      ephemeralContainers: parts.ephemeralContainers,
    },
    status: {
      containerStatuses: parts.containerStatuses,
      initContainerStatuses: parts.initContainerStatuses,
    },
  } as unknown as Pod;
}

describe('podContainer', () => {
  describe('getAllContainers', () => {
    it('returns an empty array when the pod has no containers at all', () => {
      expect(getAllContainers(makePod({}))).toEqual([]);
    });

    it('returns only main containers when init and ephemeral are absent', () => {
      const pod = makePod({ containers: [{ name: 'app' }, { name: 'sidecar' }] });

      expect(getAllContainers(pod)).toEqual([{ name: 'app' }, { name: 'sidecar' }]);
    });

    it('concatenates main, init, and ephemeral containers in that order', () => {
      const pod = makePod({
        containers: [{ name: 'app' }],
        initContainers: [{ name: 'wait-for-db' }],
        ephemeralContainers: [{ name: 'headlamp-debug' }],
      });

      expect(getAllContainers(pod)).toEqual([
        { name: 'app' },
        { name: 'wait-for-db' },
        { name: 'headlamp-debug' },
      ]);
    });

    it('treats missing spec arrays as empty (no undefined entries)', () => {
      const pod = makePod({ initContainers: [{ name: 'init-only' }] });

      expect(getAllContainers(pod)).toEqual([{ name: 'init-only' }]);
    });

    it('returns an empty array when spec itself is undefined', () => {
      const pod = { spec: undefined, status: undefined } as unknown as Pod;

      expect(getAllContainers(pod)).toEqual([]);
    });
  });

  describe('getDefaultContainer', () => {
    it('returns an empty string when the pod is null/undefined', () => {
      expect(getDefaultContainer(null as unknown as Pod)).toBe('');
      expect(getDefaultContainer(undefined as unknown as Pod)).toBe('');
    });

    it('returns the first running main container', () => {
      const pod = makePod({
        containers: [{ name: 'app' }, { name: 'sidecar' }],
        containerStatuses: [
          { name: 'app', state: {} },
          { name: 'sidecar', state: { running: {} } },
        ],
      });

      expect(getDefaultContainer(pod)).toBe('sidecar');
    });

    it('prefers a running main container over a running init container', () => {
      const pod = makePod({
        containers: [{ name: 'app' }],
        initContainers: [{ name: 'wait' }],
        containerStatuses: [{ name: 'app', state: { running: {} } }],
        initContainerStatuses: [{ name: 'wait', state: { running: {} } }],
      });

      expect(getDefaultContainer(pod)).toBe('app');
    });

    it('falls back to a running init container when no main container is running', () => {
      const pod = makePod({
        containers: [{ name: 'app' }],
        initContainers: [{ name: 'wait' }],
        containerStatuses: [{ name: 'app', state: {} }],
        initContainerStatuses: [{ name: 'wait', state: { running: {} } }],
      });

      expect(getDefaultContainer(pod)).toBe('wait');
    });

    it('falls back to the first main container when none are running', () => {
      const pod = makePod({
        containers: [{ name: 'app' }, { name: 'sidecar' }],
      });

      expect(getDefaultContainer(pod)).toBe('app');
    });

    it('returns an empty string when the pod has no main containers', () => {
      expect(getDefaultContainer(makePod({}))).toBe('');
    });

    it('returns an empty string when spec.containers is an empty array', () => {
      expect(getDefaultContainer(makePod({ containers: [] }))).toBe('');
    });
  });

  describe('resolveContainerName', () => {
    const pod = makePod({
      containers: [{ name: 'app' }, { name: 'sidecar' }],
      initContainers: [{ name: 'wait-for-db' }],
    });

    it('returns the preferred name when it matches a known container', () => {
      expect(resolveContainerName(pod, 'sidecar')).toBe('sidecar');
    });

    it('matches against init containers as well as main containers', () => {
      expect(resolveContainerName(pod, 'wait-for-db')).toBe('wait-for-db');
    });

    it('falls back to the default container when the preferred name is unknown', () => {
      expect(resolveContainerName(pod, 'does-not-exist')).toBe('app');
    });

    it('falls back to the default container when no name is preferred', () => {
      expect(resolveContainerName(pod, undefined)).toBe('app');
    });

    it('falls back to the default when the preferred name is an empty string', () => {
      expect(resolveContainerName(pod, '')).toBe('app');
    });
  });
});
