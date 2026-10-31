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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CustomResourceDefinition, { makeCustomResourceClass } from '../../lib/k8s/crd';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import { CustomResourceDetails } from './CustomResourceDetails';

// Mock the CRD hooks
vi.mock('../../lib/k8s/crd', () => ({
  default: {
    useGet: vi.fn(),
  },
  makeCustomResourceClass: vi.fn(),
}));

// Mock the translation hook correctly
vi.mock('react-i18next', async importOriginal => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key.split('|').pop(),
    }),
  };
});

// Mock complex child components to isolate the test
vi.mock('../common/Resource', async importOriginal => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    MainInfoSection: ({ resource, extraInfo }: any) => (
      <div data-testid="mock-main-info">
        <span data-testid="resource-name">{resource.metadata.name}</span>
        {extraInfo
          .filter((info: any) => !info.hide)
          .map((info: any, i: number) => (
            <div key={i} data-testid={`extra-info-${info.name}`}>
              <span className="info-name">{info.name}</span>
              <span className="info-value">
                {typeof info.value === 'string' ? info.value : 'complex-value'}
              </span>
            </div>
          ))}
      </div>
    ),
    PageGrid: ({ children }: any) => <div>{children}</div>,
    ConditionsTable: () => <div data-testid="mock-conditions-table" />,
  };
});

vi.mock('../DetailsViewSection', () => ({
  default: () => <div data-testid="mock-details-view" />,
}));

vi.mock('../common/ObjectEventList', () => ({
  default: () => <div data-testid="mock-event-list" />,
}));

vi.mock('../common/Loader', () => ({
  default: ({ title }: { title: string }) => <div data-testid="mock-loader">{title}</div>,
}));

const theme = createMuiTheme({ name: 'light', base: 'light' });

describe('CustomResourceDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setupMocks = (apiVersion: string, annotations?: Record<string, string>) => {
    const mockCrd = {
      metadata: { name: 'my-crd' },
      jsonData: {
        spec: {
          versions: [
            {
              name: apiVersion.split('/').pop(),
              additionalPrinterColumns: [
                {
                  name: 'Status',
                  jsonPath: '.status.phase',
                  type: 'string',
                },
              ],
            },
          ],
        },
      },
      makeCRClassOrNull: () => ({
        useGet: vi.fn(() => [
          {
            metadata: { name: 'my-resource', namespace: 'default', annotations },
            jsonData: {
              apiVersion: apiVersion,
              kind: 'MyResource',
              metadata: { name: 'my-resource', namespace: 'default', annotations },
              status: { phase: 'Running' },
            },
            getName: () => 'my-resource',
            getNamespace: () => 'default',
          },
          null,
        ]),
      }),
    };

    (CustomResourceDefinition.useGet as any).mockReturnValue([mockCrd, null]);
    return mockCrd;
  };

  it('correctly handles apiVersion without a slash (e.g., "v1")', async () => {
    setupMocks('v1');

    render(
      <TestContext routerMap={{ crd: 'my-crd', namespace: 'default', crName: 'my-resource' }}>
        <CustomResourceDetails crd="my-crd" crName="my-resource" namespace="default" />
      </TestContext>
    );

    // Verify the resource name
    expect(await screen.findByTestId('resource-name')).toHaveTextContent('my-resource');

    // Verify the "Definition" row (first extra info)
    expect(screen.getByTestId('extra-info-Definition')).toBeInTheDocument();

    // Verify the "Status" printer column (should be parsed correctly now)
    const statusRow = screen.getByTestId('extra-info-Status');
    expect(statusRow).toBeInTheDocument();
    expect(statusRow.querySelector('.info-value')).toHaveTextContent('Running');
  });

  it('correctly handles apiVersion with a slash (e.g., "apps/v1")', async () => {
    setupMocks('apps/v1');

    render(
      <TestContext routerMap={{ crd: 'my-crd', namespace: 'default', crName: 'my-resource' }}>
        <CustomResourceDetails crd="my-crd" crName="my-resource" namespace="default" />
      </TestContext>
    );

    // Verify the "Status" printer column
    const statusRow = await screen.findByTestId('extra-info-Status');
    expect(statusRow).toBeInTheDocument();
    expect(statusRow.querySelector('.info-value')).toHaveTextContent('Running');
  });

  it('does not show "Invalid Date" for a date printer column whose field is missing', async () => {
    const mockCrd = setupMocks('v1');
    mockCrd.jsonData.spec.versions[0].additionalPrinterColumns.push({
      name: 'Finished',
      jsonPath: '.status.completionTime',
      type: 'date',
    });

    render(
      <TestContext routerMap={{ crd: 'my-crd', namespace: 'default', crName: 'my-resource' }}>
        <CustomResourceDetails crd="my-crd" crName="my-resource" namespace="default" />
      </TestContext>
    );

    // The other printer column still renders, so the details view has loaded.
    expect(await screen.findByTestId('extra-info-Status')).toBeInTheDocument();
    // The unset date column is hidden rather than shown as "Invalid Date".
    expect(screen.queryByTestId('extra-info-Finished')).not.toBeInTheDocument();
    expect(screen.queryByText('Invalid Date')).not.toBeInTheDocument();
  });

  it('shows the last applied configuration diff before events for a client-side applied resource', async () => {
    const applied = {
      apiVersion: 'example.com/v1',
      kind: 'MyResource',
      metadata: { name: 'my-resource', namespace: 'default' },
    };
    setupMocks('example.com/v1', {
      'kubectl.kubernetes.io/last-applied-configuration': JSON.stringify(applied),
    });

    render(
      <TestContext routerMap={{ crd: 'my-crd', namespace: 'default', crName: 'my-resource' }}>
        <ThemeProvider theme={theme}>
          <CustomResourceDetails crd="my-crd" crName="my-resource" namespace="default" />
        </ThemeProvider>
      </TestContext>
    );

    const diffTitle = await screen.findByText('Last Applied Configuration');
    const eventList = screen.getByTestId('mock-event-list');
    expect(diffTitle.compareDocumentPosition(eventList)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('does not show the last applied configuration diff without the annotation', async () => {
    setupMocks('example.com/v1');

    render(
      <TestContext routerMap={{ crd: 'my-crd', namespace: 'default', crName: 'my-resource' }}>
        <ThemeProvider theme={theme}>
          <CustomResourceDetails crd="my-crd" crName="my-resource" namespace="default" />
        </ThemeProvider>
      </TestContext>
    );

    expect(await screen.findByTestId('mock-event-list')).toBeInTheDocument();
    expect(screen.queryByText('Last Applied Configuration')).not.toBeInTheDocument();
  });

  describe('a custom resource applied in another served version', () => {
    const resource = (apiVersion: string, annotations?: Record<string, string>) => ({
      apiVersion,
      kind: 'MyResource',
      metadata: { name: 'my-resource', namespace: 'default', annotations },
      spec: { size: 3 },
    });
    // Applied as example.com/v1, while the details view fetched it as example.com/v1alpha1.
    const annotations = {
      'kubectl.kubernetes.io/last-applied-configuration': JSON.stringify(
        resource('example.com/v1')
      ),
    };
    const kubeObject = (jsonData: any) => ({
      metadata: jsonData.metadata,
      jsonData,
      getName: () => 'my-resource',
      getNamespace: () => 'default',
    });

    const setupMultiVersionMocks = (servedVersions: string[]) => {
      const mockCrd = {
        metadata: { name: 'my-crd' },
        jsonData: {
          spec: {
            group: 'example.com',
            scope: 'Namespaced',
            names: { kind: 'MyResource', plural: 'myresources', singular: 'myresource' },
            versions: ['v1alpha1', 'v1'].map(name => ({
              name,
              served: servedVersions.includes(name),
              storage: name === 'v1',
              additionalPrinterColumns: [],
            })),
          },
        },
        makeCRClassOrNull: () => ({
          useGet: vi.fn(() => [kubeObject(resource('example.com/v1alpha1', annotations)), null]),
        }),
      };
      (CustomResourceDefinition.useGet as any).mockReturnValue([mockCrd, null]);
    };

    const renderDetails = () =>
      render(
        <TestContext routerMap={{ crd: 'my-crd', namespace: 'default', crName: 'my-resource' }}>
          <ThemeProvider theme={theme}>
            <CustomResourceDetails crd="my-crd" crName="my-resource" namespace="default" />
          </ThemeProvider>
        </TestContext>
      );

    it('compares the resource fetched in the applied version', async () => {
      setupMultiVersionMocks(['v1alpha1', 'v1']);
      const useGet = vi.fn(() => [kubeObject(resource('example.com/v1', annotations)), null]);
      (makeCustomResourceClass as any).mockReturnValue({ useGet });

      renderDetails();

      expect(
        await screen.findByText('In sync with the last applied configuration')
      ).toBeInTheDocument();
      expect(makeCustomResourceClass).toHaveBeenCalledWith(
        expect.objectContaining({ apiInfo: [{ group: 'example.com', version: 'v1' }] })
      );
      expect(useGet).toHaveBeenCalledWith('my-resource', 'default', { cluster: undefined });
    });

    it('shows that it cannot be compared when the applied version is not served', async () => {
      setupMultiVersionMocks(['v1alpha1']);

      renderDetails();

      expect(
        await screen.findByText(
          'This object was applied as {{appliedVersion}} and is shown as {{liveVersion}}, so it cannot be compared with the last applied configuration.'
        )
      ).toBeInTheDocument();
      expect(makeCustomResourceClass).not.toHaveBeenCalled();
      expect(screen.queryByText('Show diff')).not.toBeInTheDocument();
    });

    it('shows that it cannot be compared when fetching the applied version fails', async () => {
      setupMultiVersionMocks(['v1alpha1', 'v1']);
      (makeCustomResourceClass as any).mockReturnValue({
        useGet: vi.fn(() => [null, new Error('not found')]),
      });

      renderDetails();

      expect(
        await screen.findByText(
          'This object was applied as {{appliedVersion}} and is shown as {{liveVersion}}, so it cannot be compared with the last applied configuration.'
        )
      ).toBeInTheDocument();
      expect(screen.queryByText(/fields? differs? from/)).not.toBeInTheDocument();
    });
  });

  it('renders an empty state when makeCRClassOrNull() returns null (incomplete CRD spec, #4824)', async () => {
    const mockCrd = {
      metadata: { name: 'my-crd' },
      jsonData: { spec: {} },
      makeCRClassOrNull: () => null,
    };
    (CustomResourceDefinition.useGet as any).mockReturnValue([mockCrd, null]);

    render(
      <TestContext routerMap={{ crd: 'my-crd', namespace: 'default', crName: 'my-resource' }}>
        <CustomResourceDetails crd="my-crd" crName="my-resource" namespace="default" />
      </TestContext>
    );

    expect(
      await screen.findByText(/This CustomResourceDefinition has an incomplete spec/i)
    ).toBeInTheDocument();
    // Verify the data path did NOT render by checking for text the data
    // path would emit, rather than relying on a mocked `data-testid` whose
    // absence is true even if the mock weren't applied.
    expect(screen.queryByTestId('mock-main-info')).not.toBeInTheDocument();
    expect(screen.queryByText(/Loading custom resource details/i)).not.toBeInTheDocument();
  });
});
