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
import { isClusterNameInUse } from './util';

describe('isClusterNameInUse', () => {
  // mk-x is minikube after a rename, kind-dev was renamed to dev.
  const clusterConf = {
    'mk-x': { name: 'mk-x', meta_data: { originalName: 'minikube' } },
    dev: { name: 'dev', meta_data: { originalName: 'kind-dev' } },
    staging: { name: 'staging', meta_data: { originalName: 'staging' } },
  } as any;

  it("allows the cluster's own original name", () => {
    expect(isClusterNameInUse('minikube', 'mk-x', clusterConf)).toBe(false);
  });

  it('blocks the current name of another cluster', () => {
    expect(isClusterNameInUse('staging', 'mk-x', clusterConf)).toBe(true);
  });

  it('blocks the original name of another cluster', () => {
    expect(isClusterNameInUse('kind-dev', 'mk-x', clusterConf)).toBe(true);
  });

  it('allows a name nobody uses', () => {
    expect(isClusterNameInUse('new-name', 'mk-x', clusterConf)).toBe(false);
  });

  it('allows any name when the clusters are not loaded', () => {
    expect(isClusterNameInUse('staging', 'mk-x', null)).toBe(false);
  });
});
