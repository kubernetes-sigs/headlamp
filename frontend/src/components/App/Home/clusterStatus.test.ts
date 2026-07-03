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
import { ApiError } from '../../../lib/k8s/api/v2/ApiError';
import { canSelectCluster, getClusterStatus, getClusterStatusLabel } from './clusterStatus';

describe('getClusterStatus', () => {
  it('maps version check states to display states', () => {
    expect(getClusterStatus(null)).toBe('active');
    expect(getClusterStatus(undefined)).toBe('loading');
    expect(getClusterStatus(new ApiError('Unauthorized', { status: 401 }))).toBe('auth-error');
    expect(getClusterStatus(new ApiError('Forbidden', { status: 403 }))).toBe('permission-error');
    expect(getClusterStatus(new ApiError('Bad Gateway', { status: 502 }))).toBe('unavailable');
  });
});

describe('canSelectCluster', () => {
  it('only allows clusters with a successful status check to be selected', () => {
    expect(canSelectCluster(null)).toBe(true);
    expect(canSelectCluster(undefined)).toBe(false);
    expect(canSelectCluster(new ApiError('Unauthorized', { status: 401 }))).toBe(false);
    expect(canSelectCluster(new ApiError('Bad Gateway', { status: 502 }))).toBe(false);
  });
});

describe('getClusterStatusLabel', () => {
  const t = (key: string) => key;

  it('maps status states to translated labels', () => {
    expect(getClusterStatusLabel(t, null)).toBe('translation|Active');
    expect(getClusterStatusLabel(t, undefined)).toBe('⋯');
    expect(getClusterStatusLabel(t, new ApiError('Unauthorized', { status: 401 }))).toBe(
      'translation|Authentication required'
    );
    expect(getClusterStatusLabel(t, new ApiError('Forbidden', { status: 403 }))).toBe(
      'translation|Insufficient permissions'
    );
    expect(getClusterStatusLabel(t, new ApiError('Bad Gateway', { status: 502 }))).toBe(
      'translation|Unavailable'
    );
  });
});
