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
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storeClusterSettings } from '../../helpers/clusterSettings';
import { ApiError } from '../../lib/k8s/api/v2/ApiError';
import { ClusterGroupErrorMessage } from './ClusterGroupErrorMessage';

const CLUSTER = 'test-cluster';

vi.mock('react-i18next', async importOriginal => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key.split('|').pop() }),
}));

vi.mock('../../lib/k8s', () => ({
  useCluster: () => CLUSTER,
  useSelectedClusters: () => [CLUSTER],
}));

vi.mock('../../redux/hooks', () => ({
  useTypedSelector: (selector: any) => selector({ filter: { namespaces: new Set<string>() } }),
}));

vi.mock('../common/Link', () => ({
  default: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

const HINT =
  'Headlamp is requesting resources across the whole cluster. If you only have access to ' +
  'some namespaces, list them under Allowed namespaces in the cluster settings.';

function renderForbidden() {
  return render(
    <ClusterGroupErrorMessage
      errors={[new ApiError('forbidden', { status: 403, cluster: CLUSTER })]}
      namespacedResource
    />
  );
}

describe('ClusterGroupErrorMessage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('offers the namespace scoping hint when nothing narrows the requests', () => {
    renderForbidden();

    expect(screen.getByText(HINT, { exact: false })).toBeInTheDocument();
  });

  it('stays quiet when the allowed namespaces are already listed', () => {
    storeClusterSettings(CLUSTER, { allowedNamespaces: ['team-a'] });

    renderForbidden();

    expect(screen.queryByText(HINT, { exact: false })).not.toBeInTheDocument();
  });

  // The request layer scopes lists by the selector too, so claiming the whole cluster was
  // asked for would be untrue, and would point at a setting that is already filled in.
  it('stays quiet when a namespaces selector is configured', () => {
    storeClusterSettings(CLUSTER, { allowedNamespacesSelector: 'team=frontend' });

    renderForbidden();

    expect(screen.queryByText(HINT, { exact: false })).not.toBeInTheDocument();
  });

  it('does not offer the hint for a cluster scoped resource', () => {
    render(<ClusterGroupErrorMessage errors={[new ApiError('forbidden', { status: 403 })]} />);

    expect(screen.queryByText(HINT, { exact: false })).not.toBeInTheDocument();
  });
});
