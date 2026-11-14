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
import Pod, { type KubePod } from '../../lib/k8s/pod';
import { getClaimsFromTemplate } from './templateClaims';

const pod = (
  name: string,
  spec: Partial<KubePod['spec']>,
  resourceClaimStatuses?: KubePod['status']['resourceClaimStatuses']
) =>
  new Pod({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name, namespace: 'default', uid: name, creationTimestamp: '' },
    spec: { containers: [], nodeName: '', ...spec },
    status: {
      phase: 'Running',
      conditions: [],
      containerStatuses: [],
      startTime: '',
      resourceClaimStatuses,
    },
  });

const rows = (templateName: string, pods: Pod[]) =>
  getClaimsFromTemplate(templateName, pods).map(row => [row.pod.getName(), row.claimName]);

describe('getClaimsFromTemplate', () => {
  it('lists the claim each Pod got from the template', () => {
    const pods = [
      pod(
        'trainer-0',
        { resourceClaims: [{ name: 'gpu', resourceClaimTemplateName: 'single-gpu' }] },
        [{ name: 'gpu', resourceClaimName: 'trainer-0-gpu-x7k2q' }]
      ),
      pod(
        'trainer-1',
        { resourceClaims: [{ name: 'gpu', resourceClaimTemplateName: 'single-gpu' }] },
        [{ name: 'gpu', resourceClaimName: 'trainer-1-gpu-m4n8p' }]
      ),
    ];

    expect(rows('single-gpu', pods)).toEqual([
      ['trainer-0', 'trainer-0-gpu-x7k2q'],
      ['trainer-1', 'trainer-1-gpu-m4n8p'],
    ]);
  });

  it('keeps a Pod whose claim is not generated yet', () => {
    const pods = [
      pod('notebook', {
        resourceClaims: [{ name: 'gpu', resourceClaimTemplateName: 'single-gpu' }],
      }),
    ];

    expect(rows('single-gpu', pods)).toEqual([['notebook', undefined]]);
  });

  it('leaves out other templates and claims the Pod names directly', () => {
    const pods = [
      pod('mixed', {
        resourceClaims: [
          { name: 'gpu', resourceClaimTemplateName: 'multiple-gpus' },
          { name: 'shared', resourceClaimName: 'shared-gpu' },
        ],
      }),
      pod('plain', {}),
    ];

    expect(rows('single-gpu', pods)).toEqual([]);
  });
});
