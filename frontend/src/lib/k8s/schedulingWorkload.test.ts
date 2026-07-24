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
import App from '../../App';
import type { KubeSchedulingWorkload } from './schedulingWorkload';
import Workload from './schedulingWorkload';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const makeWorkload = (spec: Partial<KubeSchedulingWorkload['spec']>) =>
  new Workload({
    kind: 'Workload',
    apiVersion: 'scheduling.k8s.io/v1alpha3',
    metadata: {
      name: 'training-job',
      namespace: 'gang-demo',
      uid: 'uid-1',
      creationTimestamp: '2026-01-01T00:00:00Z',
    },
    spec: { podGroupTemplates: [], ...spec },
  } as KubeSchedulingWorkload);

describe('Workload', () => {
  it('uses its own list route because workloads is taken by the overview page', () => {
    expect(Workload.listRoute).toBe('schedulingWorkloads');
  });

  it('exposes the pod group templates from the spec', () => {
    const templates = [
      { name: 'workers', schedulingPolicy: { gang: { minCount: 4 } } },
      { name: 'launcher', schedulingPolicy: { basic: {} } },
    ];

    expect(makeWorkload({ podGroupTemplates: templates }).podGroupTemplates).toEqual(templates);
  });

  it('has no pod group templates when the spec is empty', () => {
    expect(makeWorkload({ podGroupTemplates: undefined }).podGroupTemplates).toEqual([]);
  });

  it('exposes the composite pod group templates from the spec', () => {
    const composite = [
      {
        name: 'gang-of-gangs',
        podGroupTemplates: [{ name: 'workers', schedulingPolicy: { gang: { minCount: 2 } } }],
      },
    ];

    expect(
      makeWorkload({ compositePodGroupTemplates: composite }).compositePodGroupTemplates
    ).toEqual(composite);
  });

  it('has no composite pod group templates when the spec omits them', () => {
    expect(makeWorkload({}).compositePodGroupTemplates).toEqual([]);
  });
});
