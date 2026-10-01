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
import { describe, expect, it, vi } from 'vitest';
import { NamespacesAutocomplete } from './NamespacesAutocomplete';

const mocks = vi.hoisted(() => ({
  cluster: 'restricted-cluster',
}));

vi.mock('../../helpers/clusterSettings', () => ({
  getCombinedAllowedNamespaces: (cluster: string) =>
    cluster === 'restricted-cluster' ? ['restricted-namespace'] : [],
}));

vi.mock('../../lib/k8s', () => ({
  useCluster: () => mocks.cluster,
  useClustersConf: () => ({}),
}));

vi.mock('../../lib/k8s/namespace', () => ({
  default: {
    useList: () => [[{ metadata: { name: 'discovered-namespace' } }], null],
  },
}));

vi.mock('../../redux/hooks', () => ({
  useTypedSelector: () => ({ namespaces: new Set<string>() }),
}));

vi.mock('react-redux', () => ({
  useDispatch: () => vi.fn(),
}));

vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useHistory: () => ({ push: vi.fn() }),
  useLocation: () => ({ pathname: '/c/restricted-cluster/advanced-search', search: '' }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('NamespacesAutocomplete', () => {
  it('replaces a previous cluster allow-list when the cluster becomes unrestricted', () => {
    const { rerender } = render(<NamespacesAutocomplete />);

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Namespaces' }));
    expect(screen.getByRole('option', { name: 'restricted-namespace' })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Namespaces' }), { key: 'Escape' });
    mocks.cluster = 'unrestricted-cluster';
    rerender(<NamespacesAutocomplete />);

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Namespaces' }));
    expect(screen.queryByRole('option', { name: 'restricted-namespace' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'discovered-namespace' })).toBeInTheDocument();
  });
});
