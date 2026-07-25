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

import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import { createMuiTheme } from '../../../lib/themes';
import { TestContext } from '../../../test';
import { MetadataDisplay } from './MetadataDisplay';

// Use vi.hoisted to ensure the mock data is available before the vi.mock call
const { mockResourceClasses } = vi.hoisted(() => {
  return {
    mockResourceClasses: {
      Job: {
        apiVersion: 'batch/v1',
        detailsRoute: 'job',
      },
      Ingress: {
        apiVersion: ['networking.k8s.io/v1', 'extensions/v1beta1'],
        detailsRoute: 'ingress',
      },
    },
  };
});

vi.mock('../../../lib/k8s', () => ({
  ResourceClasses: mockResourceClasses,
  useSelectedClusters: vi.fn(() => ['test-cluster']),
}));

const theme = createMuiTheme({ base: 'light', name: 'light' });

describe('MetadataDisplay', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // Reset any mutations to mockResourceClasses
    mockResourceClasses.Job.detailsRoute = 'job';
  });

  const mockResource = {
    metadata: {
      name: 'test-resource',
      namespace: 'test-namespace',
      creationTimestamp: '2023-01-01T00:00:00Z',
    },
    cluster: 'test-cluster',
    jsonData: {
      metadata: {
        name: 'test-resource',
        namespace: 'test-namespace',
        creationTimestamp: '2023-01-01T00:00:00Z',
      },
    },
  } as unknown as KubeObject;

  const renderWithTheme = (ui: React.ReactElement) => {
    return render(
      <TestContext>
        <ThemeProvider theme={theme}>{ui}</ThemeProvider>
      </TestContext>
    );
  };

  it('renders a link when kind and apiVersion (string) match', () => {
    const ownerReferences = [
      {
        apiVersion: 'batch/v1',
        kind: 'Job',
        name: 'test-job',
        uid: 'uid-1',
      },
    ];
    const resourceWithOwners = {
      ...mockResource,
      metadata: { ...mockResource.metadata, ownerReferences },
    } as unknown as KubeObject;

    renderWithTheme(<MetadataDisplay resource={resourceWithOwners} />);

    const link = screen.getByRole('link', { name: 'Job: test-job' });
    expect(link).toBeInTheDocument();
  });

  it('renders a link when kind and apiVersion (array) match', () => {
    const ownerReferences = [
      {
        apiVersion: 'networking.k8s.io/v1',
        kind: 'Ingress',
        name: 'test-ingress',
        uid: 'uid-2',
      },
    ];
    const resourceWithOwners = {
      ...mockResource,
      metadata: { ...mockResource.metadata, ownerReferences },
    } as unknown as KubeObject;

    renderWithTheme(<MetadataDisplay resource={resourceWithOwners} />);

    const link = screen.getByRole('link', { name: 'Ingress: test-ingress' });
    expect(link).toBeInTheDocument();
  });

  it('renders a link when kind matches and apiVersion matches the second item in the apiVersion array', () => {
    const ownerReferences = [
      {
        apiVersion: 'extensions/v1beta1',
        kind: 'Ingress',
        name: 'test-ingress-beta',
        uid: 'uid-ingress-beta',
      },
    ];
    const resourceWithOwners = {
      ...mockResource,
      metadata: { ...mockResource.metadata, ownerReferences },
    } as unknown as KubeObject;

    renderWithTheme(<MetadataDisplay resource={resourceWithOwners} />);

    const link = screen.getByRole('link', { name: 'Ingress: test-ingress-beta' });
    expect(link).toBeInTheDocument();
  });

  it('renders plain text when apiVersion does not match', () => {
    const ownerReferences = [
      {
        apiVersion: 'custom.io/v1', // Mismatch for Job (which is batch/v1)
        kind: 'Job',
        name: 'custom-job',
        uid: 'uid-3',
      },
    ];
    const resourceWithOwners = {
      ...mockResource,
      metadata: { ...mockResource.metadata, ownerReferences },
    } as unknown as KubeObject;

    renderWithTheme(<MetadataDisplay resource={resourceWithOwners} />);

    expect(screen.queryByRole('link', { name: 'Job: custom-job' })).not.toBeInTheDocument();
    expect(screen.getByText('Job: custom-job')).toBeInTheDocument();
  });

  it('correctly interpolates kind in console.error when detailsRoute lookup fails', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mocking the failure by making detailsRoute throw
    const originalRoute = mockResourceClasses.Job.detailsRoute;
    Object.defineProperty(mockResourceClasses.Job, 'detailsRoute', {
      get() {
        throw new Error('Test Error');
      },
      configurable: true,
    });

    const ownerReferences = [
      {
        apiVersion: 'batch/v1',
        kind: 'Job',
        name: 'error-job',
        uid: 'uid-4',
      },
    ];
    const resourceWithOwners = {
      ...mockResource,
      metadata: { ...mockResource.metadata, ownerReferences },
    } as unknown as KubeObject;

    try {
      expect(() =>
        renderWithTheme(<MetadataDisplay resource={resourceWithOwners} />)
      ).not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error getting routeName for Job'),
        expect.any(Error)
      );

      // Verify it falls back to plain text
      expect(screen.getByText('Job: error-job')).toBeInTheDocument();
    } finally {
      // Restore
      Object.defineProperty(mockResourceClasses.Job, 'detailsRoute', {
        value: originalRoute,
        configurable: true,
        writable: true,
      });
    }
  });
});
