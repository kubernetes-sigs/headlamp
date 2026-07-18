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
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../../test';

const { MockDeployment } = vi.hoisted(() => ({
  MockDeployment: class MockDeployment {
    metadata: any;
    kind = 'Deployment';
    spec = { template: { spec: { containers: [] } } };
    status = {};

    constructor(data: any) {
      this.metadata = data?.metadata ?? { name: 'test', namespace: 'default', uid: 'x' };
    }
    getName = () => this.metadata.name;
    getValue = () => undefined;
    getNamespace = () => this.metadata.namespace;
    getListLink = () => '/test';
    patch = () => Promise.resolve({});
    getAuthorization = () => Promise.resolve({ status: { allowed: true, reason: 'Allowed' } });
  },
}));

vi.mock('../../../lib/k8s', () => ({}));
vi.mock('../../../lib/k8s/deployment', () => ({ default: MockDeployment }));
vi.mock('../../../lib/k8s/statefulSet', () => ({ default: class {} }));
vi.mock('../../../lib/k8s/daemonSet', () => ({ default: class {} }));
vi.mock('../../../lib/k8s/KubeObject', () => ({ KubeObject: class {} }));

let capturedAuthProps: any = null;

vi.mock('./AuthVisible', () => ({
  default: (props: any) => {
    capturedAuthProps = props;
    return <>{props.children}</>;
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../ActionButton', () => ({
  default: () => null,
}));

vi.mock('../../../redux/headlampEventSlice', async () => {
  const actual = await vi.importActual<any>('../../../redux/headlampEventSlice');
  return {
    ...actual,
    useEventCallback: () => vi.fn(),
  };
});

const { RestartButton } = await import('./RestartButton');

describe('RestartButton', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    capturedAuthProps = null;
  });

  it('passes authVerb="patch" to AuthVisible', async () => {
    const mockItem = new MockDeployment({
      metadata: {
        name: 'test-deployment',
        namespace: 'default',
        uid: 'test-uid',
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TestContext>
          <RestartButton item={mockItem as any} />
        </TestContext>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(capturedAuthProps).not.toBeNull();
    });

    expect(capturedAuthProps?.authVerb).toBe('patch');
  });
});
