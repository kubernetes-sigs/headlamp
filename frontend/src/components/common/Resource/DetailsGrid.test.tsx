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

// Initialize the details components before their circular resource dependencies.
import './MainInfoSection/MainInfoSection';
import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KubeService } from '../../../lib/k8s/service';
import Service from '../../../lib/k8s/service';
import { createMuiTheme } from '../../../lib/themes';
import { TestContext } from '../../../test';
import { DetailsGrid, DetailsGridProps } from './Resource';

const theme = createMuiTheme({ base: 'light', name: 'light' });
const originalUrl = window.location.href;

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, '', originalUrl);
});

describe('DetailsGrid section builders', () => {
  it.each([
    { builder: 'headerSection', namespace: 'default', cluster: 'explicit-cluster' },
    { builder: 'sectionsFunc', namespace: 'default', cluster: undefined },
    { builder: 'extraSections', namespace: undefined, cluster: undefined },
  ] as const)(
    'preserves other sections and recovers when $builder reads a missing spec',
    ({ builder, namespace, cluster }) => {
      window.history.replaceState({}, '', '/c/selected-cluster/services');
      const resource = new Service(
        {
          apiVersion: 'v1',
          kind: 'Service',
          metadata: {
            name: 'partial-service',
            namespace,
            uid: 'partial-service-uid',
            creationTimestamp: '2026-01-01T00:00:00Z',
            labels: { app: 'partial-service-label' },
          },
        } as unknown as KubeService,
        cluster ?? 'selected-cluster'
      );
      const response = Object.assign([resource, null] as [Service, null], {
        data: resource,
        error: null,
        isError: false,
        isLoading: false,
        isFetching: false,
        isSuccess: true,
        status: 'success' as const,
      });
      vi.spyOn(Service, 'useGet').mockReturnValue(response);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const builders: Pick<
        DetailsGridProps<typeof Service>,
        'headerSection' | 'sectionsFunc' | 'extraSections'
      > = {
        headerSection: () => <div>Healthy header</div>,
        sectionsFunc: () => <div>Healthy legacy section</div>,
        extraSections: () => [<div key="extra">Healthy extra section</div>],
        [builder]: (item: Service) => [
          <div key="ports">Port count: {item.spec.ports!.length}</div>,
        ],
      };
      const view = () => (
        <TestContext routerMap={{ cluster: 'selected-cluster' }}>
          <ThemeProvider theme={theme}>
            <DetailsGrid
              resourceType={Service}
              name={resource.metadata.name}
              namespace={namespace}
              cluster={cluster}
              noDefaultActions
              backLink=""
              {...builders}
            >
              <div>Unaffected child section</div>
            </DetailsGrid>
          </ThemeProvider>
        </TestContext>
      );
      const { rerender } = render(view());

      expect(screen.getByText(/partial-service-label/)).toBeInTheDocument();
      expect(screen.getByText('Unaffected child section')).toBeInTheDocument();
      for (const [key, text] of Object.entries({
        headerSection: 'Healthy header',
        sectionsFunc: 'Healthy legacy section',
        extraSections: 'Healthy extra section',
      })) {
        if (key !== builder) {
          expect(screen.getByText(text)).toBeInTheDocument();
        }
      }
      expect(consoleError).toHaveBeenCalledWith(
        `Headlamp: ${builder} for Service${
          namespace ? `/${namespace}` : ''
        }/partial-service (cluster: ${cluster ?? 'selected-cluster'}) threw`,
        expect.any(TypeError)
      );

      const loadedResource = new Service(
        { ...resource.jsonData, spec: { ...Service.getBaseObject().spec, ports: [] } },
        resource.cluster
      );
      response[0] = loadedResource;
      response.data = loadedResource;
      consoleError.mockClear();
      rerender(view());

      expect(screen.getByText('Port count: 0')).toBeInTheDocument();
      expect(screen.getByText(/partial-service-label/)).toBeInTheDocument();
      expect(screen.getByText('Unaffected child section')).toBeInTheDocument();
      expect(consoleError).not.toHaveBeenCalled();
    }
  );
});
