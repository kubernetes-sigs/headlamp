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
import { getDefaultContainer, resolveContainerName } from './podContainer';

const running = { running: { startedAt: '2025-01-01T00:00:00Z' } };

// The helpers only read metadata, spec and status, so a plain object is enough.
function makePod(annotations?: Record<string, string>): Pod {
  return {
    metadata: { name: 'web', namespace: 'default', annotations },
    spec: {
      // Mesh proxies such as istio-proxy can be injected ahead of the app container.
      containers: [
        { name: 'istio-proxy', image: 'proxy' },
        { name: 'app', image: 'app' },
      ],
      nodeName: 'node-1',
    },
    status: {
      phase: 'Running',
      containerStatuses: [
        { name: 'istio-proxy', ready: true, restartCount: 0, state: running },
        { name: 'app', ready: true, restartCount: 0, state: running },
      ],
    },
  } as unknown as Pod;
}

describe('getDefaultContainer', () => {
  it('uses the first running container when there is no default-container annotation', () => {
    expect(getDefaultContainer(makePod())).toBe('istio-proxy');
  });

  it('uses the container named by the kubectl.kubernetes.io/default-container annotation', () => {
    const pod = makePod({ 'kubectl.kubernetes.io/default-container': 'app' });
    expect(getDefaultContainer(pod)).toBe('app');
  });

  it('ignores a default-container annotation naming a container the pod does not have', () => {
    const pod = makePod({ 'kubectl.kubernetes.io/default-container': 'missing' });
    expect(getDefaultContainer(pod)).toBe('istio-proxy');
  });
});

describe('resolveContainerName', () => {
  it('prefers an explicitly requested container over the annotation', () => {
    const pod = makePod({ 'kubectl.kubernetes.io/default-container': 'app' });
    expect(resolveContainerName(pod, 'istio-proxy')).toBe('istio-proxy');
  });

  it('falls back to the annotated container when no container is requested', () => {
    const pod = makePod({ 'kubectl.kubernetes.io/default-container': 'app' });
    expect(resolveContainerName(pod, undefined)).toBe('app');
  });
});
