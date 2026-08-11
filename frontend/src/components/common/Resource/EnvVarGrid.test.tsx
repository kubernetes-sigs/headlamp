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

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import Secret from '../../../lib/k8s/secret';
import { TestContext } from '../../../test';
import { EnvVarGrid } from './EnvVarGrid';

vi.mock('../../../lib/k8s', () => ({}));
vi.mock('../../../lib/k8s/secret', () => {
  return {
    default: {
      apiGet: vi.fn(),
    },
    __esModule: true,
  };
});

describe('EnvVarGrid component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders standard env vars correctly', () => {
    render(
      <TestContext>
        <EnvVarGrid
          envVars={[{ name: 'FOO', value: 'BAR' }]}
          namespace="default"
          cluster="minikube"
        />
      </TestContext>
    );

    expect(screen.getByText(/FOO/)).toBeInTheDocument();
    expect(screen.getByText(/BAR/)).toBeInTheDocument();
  });

  it('renders secret references and fetches the value on click', async () => {
    const mockSecret = {
      jsonData: {
        kind: 'Secret',
        apiVersion: 'v1',
        metadata: { name: 'my-secret', namespace: 'default' },
        data: { 'api-key': 'c2VjcmV0LXZhbHVl' }, // "secret-value" in base64
      },
      data: { 'api-key': 'c2VjcmV0LXZhbHVl' },
    };

    const mockApiGet = vi.fn().mockImplementation(onGet => {
      return () => {
        onGet(mockSecret);
        return Promise.resolve(vi.fn());
      };
    });
    Secret.apiGet = mockApiGet;

    render(
      <TestContext>
        <EnvVarGrid
          envVars={[
            {
              name: 'API_KEY',
              valueFrom: {
                secretKeyRef: { name: 'my-secret', key: 'api-key' },
              },
            },
          ]}
          namespace="default"
          cluster="minikube"
        />
      </TestContext>
    );

    // Initial render shows link to secret
    expect(screen.getByText(/Secret: my-secret/)).toBeInTheDocument();

    // Click reveal eye icon
    const showButton = screen.getByRole('button', { name: /Show/ });
    fireEvent.click(showButton);

    // Verify secret loading API was called
    expect(mockApiGet).toHaveBeenCalledWith(
      expect.any(Function),
      'my-secret',
      'default',
      expect.any(Function),
      { cluster: 'minikube' }
    );

    // Click show eye button inside SecretField to decrypt and render
    const toggleFieldVisibility = await screen.findByRole('button', {
      name: /toggle field visibility/,
    });
    fireEvent.click(toggleFieldVisibility);

    // Verify value is decrypted and shown
    expect(screen.getByDisplayValue('secret-value')).toBeInTheDocument();
  });

  it('handles RBAC authorization errors gracefully', async () => {
    const mockApiGet = vi.fn().mockImplementation((...args) => {
      const onError = args[3];
      return () => {
        onError({ status: 401, message: 'Unauthorized' });
        return Promise.resolve(vi.fn());
      };
    });
    Secret.apiGet = mockApiGet;

    render(
      <TestContext>
        <EnvVarGrid
          envVars={[
            {
              name: 'API_KEY',
              valueFrom: {
                secretKeyRef: { name: 'my-secret', key: 'api-key' },
              },
            },
          ]}
          namespace="default"
          cluster="minikube"
        />
      </TestContext>
    );

    const showButton = screen.getByRole('button', { name: /Show/ });
    fireEvent.click(showButton);

    // Verify unauthorized error text is shown
    expect(await screen.findByText('(Unauthorized)')).toBeInTheDocument();
  });

  it('handles RBAC forbidden/permission errors gracefully', async () => {
    const mockApiGet = vi.fn().mockImplementation((...args) => {
      const onError = args[3];
      return () => {
        onError({ status: 403, message: 'Forbidden' });
        return Promise.resolve(vi.fn());
      };
    });
    Secret.apiGet = mockApiGet;

    render(
      <TestContext>
        <EnvVarGrid
          envVars={[
            {
              name: 'API_KEY',
              valueFrom: {
                secretKeyRef: { name: 'my-secret', key: 'api-key' },
              },
            },
          ]}
          namespace="default"
          cluster="minikube"
        />
      </TestContext>
    );

    const showButton = screen.getByRole('button', { name: /Show/ });
    fireEvent.click(showButton);

    // Verify forbidden error text is shown
    expect(await screen.findByText('(Forbidden)')).toBeInTheDocument();
  });
});
