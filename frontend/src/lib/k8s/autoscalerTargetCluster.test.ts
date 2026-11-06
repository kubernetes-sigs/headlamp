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

import HPA from './hpa';
import VPA from './vpa';

// These model tests do not render the application or format resource ages.
vi.mock('../util', () => ({ timeAgo: vi.fn() }));
vi.mock('.', async () => ({
  ResourceClasses: { Deployment: (await import('./deployment')).default },
}));

describe.each([
  { name: 'HPA', Resource: HPA, targetKey: 'scaleTargetRef' },
  { name: 'VPA', Resource: VPA, targetKey: 'targetRef' },
])('$name referenceObject cluster', ({ Resource, targetKey }) => {
  const target = { apiVersion: 'apps/v1', kind: 'Deployment', name: 'web' };

  beforeEach(() => {
    window.history.replaceState({}, '', '/c/primary+secondary/workloads');
  });

  it.each(['primary', 'secondary'])('retains the source cluster %s', cluster => {
    const autoscaler = new Resource(
      {
        metadata: { name: 'web-scaler', namespace: 'team' },
        spec: { [targetKey]: target },
      } as any,
      cluster
    );

    const reference = autoscaler.referenceObject;
    expect(reference?.cluster).toBe(cluster);
    expect(reference?.kind).toBe('Deployment');
    expect(reference?.getName()).toBe('web');
    expect(reference?.getNamespace()).toBe('team');
  });

  it('uses the current source cluster after navigation changes', () => {
    const autoscaler = new Resource(
      { metadata: { namespace: 'team' }, spec: { [targetKey]: target } } as any,
      'secondary'
    );
    window.history.replaceState({}, '', '/c/other/workloads');
    expect(autoscaler.referenceObject?.cluster).toBe('secondary');
  });

  it('returns null when the target is absent', () => {
    const autoscaler = new Resource({ metadata: {}, spec: {} } as any, 'secondary');
    expect(autoscaler.referenceObject).toBeNull();
  });
});
