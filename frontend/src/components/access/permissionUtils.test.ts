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
import type { ApiResource } from '../../lib/k8s/api/v2/ApiResource';
import { getPermissionState } from './permissionUtils';

const pods: ApiResource = {
  apiVersion: 'v1',
  version: 'v1',
  pluralName: 'pods',
  singularName: 'pod',
  kind: 'Pod',
  isNamespaced: true,
};

describe('getPermissionState', () => {
  it('returns allowed when a matching unrestricted rule exists', () => {
    expect(
      getPermissionState(
        {
          resourceRules: [
            {
              verbs: ['get', 'list'],
              apiGroups: [''],
              resources: ['pods'],
            },
          ],
        },
        pods,
        'get'
      )
    ).toBe('allowed');
  });

  it('returns limited when access is restricted to resource names', () => {
    expect(
      getPermissionState(
        {
          resourceRules: [
            {
              verbs: ['get'],
              apiGroups: [''],
              resources: ['pods'],
              resourceNames: ['mypod'],
            },
          ],
        },
        pods,
        'get'
      )
    ).toBe('limited');
  });

  it('honors wildcard verbs, groups, and resources', () => {
    expect(
      getPermissionState(
        {
          resourceRules: [
            {
              verbs: ['*'],
              apiGroups: ['*'],
              resources: ['*'],
            },
          ],
        },
        pods,
        'delete'
      )
    ).toBe('allowed');
  });
});
