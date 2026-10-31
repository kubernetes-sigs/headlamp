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
import { getClusterSettingsURL } from './clusterSettings';

describe('getClusterSettingsURL', () => {
  it.each([
    'production',
    'test+qa',
    'test&qa',
    'test#qa',
    'test?qa',
    'test=qa',
    'test%qa',
    'test/qa',
    'test%2Fqa',
    'cluster with spaces',
    '集群',
    'prod&c=another-cluster',
  ])('round-trips cluster name %s as one query parameter', cluster => {
    const url = new URL(getClusterSettingsURL(cluster), 'http://localhost');
    expect(url.pathname).toBe('/settings/cluster');
    expect([...url.searchParams.entries()]).toEqual([['c', cluster]]);
    expect(url.hash).toBe('');
  });

  it.each([undefined, null, ''])('omits the cluster query for %s', cluster => {
    expect(getClusterSettingsURL(cluster)).toBe('/settings/cluster');
  });

  it('leaves ordinary cluster URLs compatible', () => {
    expect(getClusterSettingsURL('production-1')).toBe('/settings/cluster?c=production-1');
  });
});
