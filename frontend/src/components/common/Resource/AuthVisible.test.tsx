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
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AuthVisible from './AuthVisible';

describe('AuthVisible', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });

  it('renders children if authorized', async () => {
    const mockItem = {
      _class: () => ({
        apiName: 'pods',
        apiVersion: 'v1',
      }),
      getName: () => 'test-pod',
      getAuthorization: vi.fn().mockResolvedValue({
        status: {
          allowed: true,
          reason: 'Allowed',
        },
      }),
    };

    const onAuthResult = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthVisible item={mockItem as any} authVerb="get" onAuthResult={onAuthResult}>
          <div>Authorized Content</div>
        </AuthVisible>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(onAuthResult).toHaveBeenCalledWith({
        allowed: true,
        reason: 'Allowed',
      });
    });

    expect(screen.getByText('Authorized Content')).toBeInTheDocument();
  });

  it('does not render children if not authorized', async () => {
    const mockItem = {
      _class: () => ({
        apiName: 'pods',
        apiVersion: 'v1',
      }),
      getName: () => 'test-pod',
      getAuthorization: vi.fn().mockResolvedValue({
        status: {
          allowed: false,
          reason: 'Forbidden',
        },
      }),
    };

    const onAuthResult = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthVisible item={mockItem as any} authVerb="get" onAuthResult={onAuthResult}>
          <div>Authorized Content</div>
        </AuthVisible>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(onAuthResult).toHaveBeenCalledWith({
        allowed: false,
        reason: 'Forbidden',
      });
    });

    expect(screen.queryByText('Authorized Content')).toBeNull();
  });

  it('warns and returns null if authVerb is invalid', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mockItem = {
      _class: () => ({
        apiName: 'pods',
        apiVersion: 'v1',
      }),
      getName: () => 'test-pod',
    };

    render(
      <QueryClientProvider client={queryClient}>
        <AuthVisible item={mockItem as any} authVerb="invalid-verb">
          <div>Authorized Content</div>
        </AuthVisible>
      </QueryClientProvider>
    );

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid authVerb provided: "invalid-verb"')
    );
    expect(screen.queryByText('Authorized Content')).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('does not crash if item is null', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AuthVisible item={null} authVerb="get">
          <div>Authorized Content</div>
        </AuthVisible>
      </QueryClientProvider>
    );

    expect(screen.queryByText('Authorized Content')).toBeNull();
  });
});
