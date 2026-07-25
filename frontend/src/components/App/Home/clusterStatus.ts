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

import type { ApiError } from '../../../lib/k8s/api/v2/ApiError';

export type ClusterStatusState =
  | 'active'
  | 'auth-error'
  | 'loading'
  | 'permission-error'
  | 'unavailable';
type Translate = (key: string) => string;

export function getClusterStatus(error?: ApiError | null): ClusterStatusState {
  if (error === undefined) {
    return 'loading';
  }

  if (error === null) {
    return 'active';
  }

  if (error.status === 401) {
    return 'auth-error';
  }
  if (error.status === 403) {
    return 'permission-error';
  }

  return 'unavailable';
}

export function canSelectCluster(error?: ApiError | null) {
  return getClusterStatus(error) === 'active';
}

export function getClusterStatusLabel(t: Translate, error?: ApiError | null) {
  const status = getClusterStatus(error);
  if (status === 'active') {
    return t('translation|Active');
  }
  if (status === 'auth-error') {
    return t('translation|Authentication required');
  }
  if (status === 'permission-error') {
    return t('translation|Insufficient permissions');
  }
  if (status === 'unavailable') {
    return t('translation|Unavailable');
  }
  return '⋯';
}
