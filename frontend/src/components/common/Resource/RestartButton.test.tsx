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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Deployment from '../../../lib/k8s/deployment';
import { RestartButton } from './RestartButton';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|')[1] || key,
  }),
}));
const { MockKubeObject } = vi.hoisted(() => {
  class MockKubeObject {
    jsonData: any;

    constructor(data: any) {
      this.jsonData = data;
    }

    get kind() {
      return this.jsonData?.kind;
    }

    static kind = '';

    static isClassOf(maybeInstance: any) {
      return maybeInstance?.kind === this.kind;
    }

    _class() {
      return this.constructor as any;
    }

    get metadata() {
      return this.jsonData?.metadata;
    }

    getName() {
      return this.jsonData?.metadata?.name ?? '';
    }

    get cluster() {
      return '';
    }
  }

  return { MockKubeObject };
});

vi.mock('../../../lib/k8s/KubeObject', () => ({
  KubeObject: MockKubeObject,
}));

vi.mock('../../../lib/k8s/deployment', () => {
  class Deployment extends MockKubeObject {
    static kind = 'Deployment';
  }

  return {
    default: Deployment,
    __esModule: true,
  };
});

vi.mock('../../../lib/k8s/statefulSet', () => {
  class StatefulSet extends MockKubeObject {
    static kind = 'StatefulSet';
  }

  return {
    default: StatefulSet,
    __esModule: true,
  };
});

vi.mock('../../../lib/k8s/daemonSet', () => {
  class DaemonSet extends MockKubeObject {
    static kind = 'DaemonSet';
  }

  return {
    default: DaemonSet,
    __esModule: true,
  };
});

const mockDispatch = vi.fn();

vi.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
}));

vi.mock('react-router', () => ({
  useLocation: () => ({
    pathname: '/workloads',
  }),
}));

describe('RestartButton', () => {
  it('requests authorization using the patch verb', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    const deployment = new Deployment({
      kind: 'Deployment',
      metadata: {
        name: 'nginx',
        namespace: 'default',
      },
    } as any);
    const getAuthorizationMock = vi.fn(async (verb: string) => ({
      status: {
        allowed: verb === 'patch',
        reason: verb === 'patch' ? 'Allowed' : 'Forbidden',
      },
    }));

    deployment.getAuthorization = getAuthorizationMock;
    render(
      <QueryClientProvider client={queryClient}>
        <RestartButton item={deployment} />
      </QueryClientProvider>
    );

    await waitFor(() => {
      const verbs = getAuthorizationMock.mock.calls.map(([verb]) => verb);
      expect(verbs).toContain('patch');
      expect(verbs).not.toContain('update');
    });
  });
});
