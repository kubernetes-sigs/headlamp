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

import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CustomResourceDefinition from '../../lib/k8s/crd';
import { TestContext } from '../../test';
import { CustomResourceDetails } from './CustomResourceDetails';

// Mock the CRD hooks
vi.mock('../../lib/k8s/crd', () => ({
  default: {
    useGet: vi.fn(),
  },
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
        {extraInfo.map((info: any, i: number) => (
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

describe('CustomResourceDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setupMocks = (apiVersion: string) => {
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
      makeCRClass: () => ({
        useGet: vi.fn(() => [
          {
            metadata: { name: 'my-resource', namespace: 'default' },
            jsonData: {
              apiVersion: apiVersion,
              kind: 'MyResource',
              metadata: { name: 'my-resource', namespace: 'default' },
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
});
