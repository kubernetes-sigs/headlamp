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
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import EndpointSliceDetails from './Details';

const { endpointSlice } = vi.hoisted(() => ({
  endpointSlice: { current: {} as any },
}));

// Importing the real k8s classes here runs into the lib/k8s import cycle, so only stub what
// this page imports from there.
vi.mock('../../lib/k8s', () => ({
  ResourceClasses: { Pod: { detailsRoute: 'Pod' } },
  getResourceClass: (kind: string) => (kind === 'Pod' ? { detailsRoute: 'Pod' } : null),
}));
vi.mock('../../lib/k8s/endpointSlices', () => ({ default: { kind: 'EndpointSlice' } }));

// DetailsGrid normally fetches the EndpointSlice. Render its extra sections for a fixed item.
vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => (
    <div>
      {props.extraSections(endpointSlice.current).map((section: any) => (
        <div key={section.id}>{section.section}</div>
      ))}
    </div>
  ),
}));

const theme = createMuiTheme({ base: 'light', name: 'light' });

function renderDetails() {
  render(
    <TestContext>
      <ThemeProvider theme={theme}>
        <EndpointSliceDetails name="web-abcde" namespace="apps" cluster="cluster-b" />
      </ThemeProvider>
    </TestContext>
  );
}

describe('EndpointSliceDetails endpoint targets', () => {
  const originalPath = window.location.pathname;

  beforeEach(() => {
    window.history.pushState({}, '', '/c/cluster-b/endpointslices');
    endpointSlice.current = {
      cluster: 'cluster-b',
      spec: {
        addressType: 'IPv4',
        endpoints: [
          {
            addresses: ['10.1.0.7'],
            targetRef: { kind: 'Pod', name: 'web-0', namespace: 'apps' },
          },
          {
            addresses: ['10.1.0.8'],
            targetRef: { kind: 'Unknown', name: 'external-thing', namespace: 'apps' },
          },
          { addresses: ['10.1.0.9'] },
        ],
        ports: [],
      },
    };
  });

  afterEach(() => {
    window.history.pushState({}, '', originalPath);
  });

  it('shows a Target column', () => {
    renderDetails();

    expect(screen.getByRole('columnheader', { name: 'Target' })).toBeInTheDocument();
  });

  it("links each endpoint to its target Pod in the slice's cluster", () => {
    renderDetails();

    expect(screen.getByRole('link', { name: 'web-0' })).toHaveAttribute(
      'href',
      '/c/cluster-b/pods/apps/web-0'
    );
  });

  it('shows the target name as text when its kind is unknown', () => {
    renderDetails();

    const row = screen.getByText('10.1.0.8').closest('tr')!;
    expect(within(row).getByText('external-thing')).toBeInTheDocument();
    expect(within(row).queryByRole('link')).not.toBeInTheDocument();
  });
});
