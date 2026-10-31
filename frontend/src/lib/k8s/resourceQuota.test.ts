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
import ResourceQuota from './resourceQuota';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const makeResourceQuota = (spec?: { hard?: Record<string, string> }) =>
  new ResourceQuota({
    apiVersion: 'v1',
    kind: 'ResourceQuota',
    metadata: {
      name: 'test-quota',
      namespace: 'default',
      creationTimestamp: '',
      uid: '',
    },
    ...(spec === undefined ? {} : { spec }),
  });

describe('ResourceQuota', () => {
  it('returns empty request and limit summaries when spec is missing', () => {
    const quota = makeResourceQuota();

    expect(quota.requests).toEqual([]);
    expect(quota.limits).toEqual([]);
  });

  it('returns empty request and limit summaries when spec.hard is missing', () => {
    const quota = makeResourceQuota({});

    expect(quota.requests).toEqual([]);
    expect(quota.limits).toEqual([]);
  });

  it('summarizes request and limit hard values', () => {
    const quota = makeResourceQuota({
      hard: {
        'requests.cpu': '2',
        'limits.memory': '1Gi',
      },
    });

    expect(quota.requests).toEqual(['requests.cpu: 0 cores/2 cores']);
    expect(quota.limits).toEqual(['limits.memory: 0 Bytes/1.07 GB']);
  });
});
