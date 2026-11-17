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

// Registers the app's routes (via setDefaultRoutes) so Link's createRouteURL has routes to resolve.
import '../../lib/router';
import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { ApiResource } from '../../lib/k8s/api/v2/ApiResource';
import { KubeObject } from '../../lib/k8s/KubeObject';
import Pod from '../../lib/k8s/pod';
import { createRouteURL } from '../../lib/router/createRouteURL';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import { ResourceSearch } from './ResourceSearch';

const theme = createMuiTheme({ base: 'light', name: 'light' });

const { mockUseKubeLists } = vi.hoisted(() => ({ mockUseKubeLists: vi.fn() }));

vi.mock('./utils/useKubeLists', () => ({ useKubeLists: mockUseKubeLists }));

vi.mock('@monaco-editor/react', () => ({
  Editor: () => <div data-testid="mock-monaco-editor" />,
  useMonaco: () => null,
}));

// Fallback class produced by useKubeLists (see useKubeLists.ts) for a kind/apiVersion
// combination that doesn't resolve to a registered built-in class.
function makeFallbackClass(
  kind: string,
  apiVersion: string,
  apiName: string,
  isNamespaced: boolean
) {
  return class extends KubeObject {
    static kind = kind;
    static apiVersion = apiVersion;
    static apiName = apiName;
    static isNamespaced = isNamespaced;
  };
}

// Shares the built-in Pod's `kind` but not its API group, reproducing issue #7321.
const MismatchedPod = makeFallbackClass('Pod', 'crd.example.com/v1', 'pods', true);

const builtinPodResource: ApiResource = {
  apiVersion: 'v1',
  groupName: '',
  version: 'v1',
  pluralName: 'pods',
  singularName: 'pod',
  kind: 'Pod',
  isNamespaced: true,
};

const crdPodResource: ApiResource = {
  apiVersion: 'crd.example.com/v1',
  groupName: 'crd.example.com',
  version: 'v1',
  pluralName: 'pods',
  singularName: 'pod',
  kind: 'Pod',
  isNamespaced: true,
};

const vpaResource: ApiResource = {
  apiVersion: 'autoscaling.k8s.io/v1',
  groupName: 'autoscaling.k8s.io',
  version: 'v1',
  pluralName: 'verticalpodautoscalers',
  singularName: 'verticalpodautoscaler',
  kind: 'VerticalPodAutoscaler',
  isNamespaced: true,
};

function makeItem(ctor: any, name: string, apiVersion: string): KubeObject {
  return new ctor(
    {
      kind: ctor.kind,
      apiVersion,
      metadata: {
        name,
        namespace: 'default',
        uid: name,
        creationTimestamp: '2025-01-01T00:00:00Z',
      },
    } as any,
    'test-cluster'
  );
}

function renderSearch() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <TestContext>
        <ThemeProvider theme={theme}>
          <ResourceSearch
            resources={[builtinPodResource, crdPodResource, vpaResource]}
            selectedClusters={['test-cluster']}
            rawQuery="true"
            maxItemsPerResource={100}
            refetchIntervalMs={60000}
            setRawQuery={() => {}}
          />
        </ThemeProvider>
      </TestContext>
    </QueryClientProvider>
  );
}

describe('ResourceSearch result-link eligibility (issue #7321)', () => {
  beforeEach(() => {
    const matched = makeItem(Pod, 'matched-pod', 'v1');
    const mismatched = makeItem(MismatchedPod, 'mismatched-pod', 'crd.example.com/v1');
    // VerticalPodAutoscaler is supported (canRenderDetails/supportedKinds) but, like several
    // other built-ins, isn't registered in ResourceClasses, so useKubeLists always resolves
    // it through the generic fallback class — never the group-aware getResourceClass path.
    const VPA = makeFallbackClass(
      'VerticalPodAutoscaler',
      'autoscaling.k8s.io/v1',
      'verticalpodautoscalers',
      true
    );
    const vpa = makeItem(VPA, 'genuine-vpa', 'autoscaling.k8s.io/v1');
    mockUseKubeLists.mockReturnValue({
      items: [matched, mismatched, vpa],
      errors: [],
      isLoading: false,
    });
  });

  it('links a matching built-in resource but renders a mismatched-group item as plain text', async () => {
    renderSearch();

    await waitFor(() => expect(screen.getByText('matched-pod')).toBeInTheDocument());
    expect(screen.getByText('mismatched-pod')).toBeInTheDocument();
    expect(screen.getByText('genuine-vpa')).toBeInTheDocument();

    // The genuine Pod is eligible for a details link, to its actual canonical details route.
    const expectedPodHref = createRouteURL('Pod', {
      cluster: 'test-cluster',
      namespace: 'default',
      name: 'matched-pod',
    });
    expect(screen.getByRole('link', { name: 'matched-pod' })).toHaveAttribute(
      'href',
      expectedPodHref
    );

    // The CRD that merely shares the "Pod" kind name must not link to the built-in's
    // details route: it should render as plain text, with no enclosing link.
    expect(screen.queryByRole('link', { name: 'mismatched-pod' })).not.toBeInTheDocument();

    // VerticalPodAutoscaler isn't in ResourceClasses at all, so it must still link via its
    // own supported (non-group-checked) details route, same as before this fix.
    const expectedVpaHref = createRouteURL('VerticalPodAutoscaler', {
      cluster: 'test-cluster',
      namespace: 'default',
      name: 'genuine-vpa',
    });
    expect(screen.getByRole('link', { name: 'genuine-vpa' })).toHaveAttribute(
      'href',
      expectedVpaHref
    );
  });
});
