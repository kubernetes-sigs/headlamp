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

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useKubeLists } from './useKubeLists';

const mockRegisteredUseList = vi.hoisted(() =>
  vi.fn(() => ({
    items: [],
    isError: false,
    errors: undefined,
  }))
);

const mockGenericUseList = vi.hoisted(() =>
  vi.fn(() => ({
    items: [],
    isError: false,
    errors: undefined,
  }))
);

vi.mock('../../../lib/k8s', () => {
  class Deployment {
    static apiVersion = 'apps/v1';
    static apiName = 'deployments';
    static isNamespaced = true;
    static useList = mockRegisteredUseList;
  }

  return {
    ResourceClasses: {
      Deployment,
    },
  };
});

vi.mock('../../../lib/k8s/cluster', () => {
  class KubeObject {
    static useList = mockGenericUseList;
  }

  return {
    KubeObject,
  };
});

const mockUseNamespaces = vi.hoisted(() => vi.fn(() => []));

vi.mock('../../../redux/filterSlice', () => ({
  useNamespaces: mockUseNamespaces,
}));

describe('useKubeLists', () => {
  it('does not reuse a registered ResourceClass when the API identity does not match', () => {
    const resources = [
      {
        kind: 'Deployment',
        apiVersion: 'apps/v1beta1',
        version: 'v1beta1',
        singularName: 'deployment',
        pluralName: 'deployments',
        isNamespaced: true,
      },
    ];

    renderHook(() => useKubeLists(resources, ['cluster'], 10));

    expect(mockRegisteredUseList).not.toHaveBeenCalled();
    expect(mockGenericUseList).toHaveBeenCalled();
  });
});
