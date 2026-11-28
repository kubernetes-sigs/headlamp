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

// Registers the app's routes, so the target links can resolve their URLs.
import '../../lib/router';
import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import EndpointDetails from './Details';

const { endpoints, mockActivityLaunch } = vi.hoisted(() => ({
  endpoints: { current: {} as any },
  mockActivityLaunch: vi.fn(),
}));

// Importing the real k8s classes here runs into the lib/k8s import cycle, so only stub what
// this page imports from there.
vi.mock('../../lib/k8s', () => ({
  ResourceClasses: { Pod: { detailsRoute: 'Pod' } },
  getResourceClass: (kind: string) => (kind === 'Pod' ? { detailsRoute: 'Pod' } : null),
}));
vi.mock('../../lib/k8s/endpoints', () => ({ default: { kind: 'Endpoints' } }));

// With the details drawer on (the default), Link opens the Pod through Activity.launch.
vi.mock('../activity/Activity', () => ({
  Activity: { launch: (...args: any[]) => mockActivityLaunch(...args) },
}));

// DetailsGrid normally fetches the Endpoints. Render its extra sections for a fixed item.
vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => (
    <div>
      {props.extraSections(endpoints.current).map((section: any) => (
        <div key={section.id}>{section.section}</div>
      ))}
    </div>
  ),
}));

const theme = createMuiTheme({ base: 'light', name: 'light' });

describe('EndpointDetails target links', () => {
  const originalPath = window.location.pathname;

  beforeEach(() => {
    mockActivityLaunch.mockReset();
    // Two clusters are selected, and cluster-a comes first in the URL.
    window.history.pushState({}, '', '/c/cluster-a+cluster-b/endpoints');
    endpoints.current = {
      cluster: 'cluster-b',
      subsets: [
        {
          addresses: [
            { ip: '10.1.0.7', targetRef: { kind: 'Pod', name: 'web-0', namespace: 'apps' } },
          ],
          ports: [],
        },
      ],
    };
    render(
      <TestContext>
        <ThemeProvider theme={theme}>
          <EndpointDetails name="web" namespace="apps" cluster="cluster-b" />
        </ThemeProvider>
      </TestContext>
    );
  });

  afterEach(() => {
    window.history.pushState({}, '', originalPath);
  });

  it("links to the target in the Endpoints' own cluster", () => {
    expect(screen.getByRole('link', { name: 'web-0' })).toHaveAttribute(
      'href',
      '/c/cluster-b+cluster-a/pods/apps/web-0'
    );
  });

  it("opens the target drawer for the Endpoints' own cluster", () => {
    fireEvent.click(screen.getByRole('link', { name: 'web-0' }));

    expect(mockActivityLaunch).toHaveBeenCalledTimes(1);
    expect(mockActivityLaunch.mock.calls[0][0]).toMatchObject({
      kind: 'details',
      cluster: 'cluster-b',
      title: 'Pod web-0',
    });
  });
});
