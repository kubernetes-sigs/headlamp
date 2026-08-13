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

import { createTheme, ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen } from '@testing-library/react';
import { PureNamespacesAutocomplete } from './NamespacesAutocomplete';

vi.mock('../../lib/k8s', () => ({
  useCluster: () => 'test-cluster',
  useClustersConf: () => ({}),
}));

vi.mock('../../lib/k8s/namespace', () => ({ default: {} }));

describe('PureNamespacesAutocomplete', () => {
  it('renders all selected namespace names', () => {
    const namespaces = ['payments-production', 'checkout-production', 'observability'];

    render(
      <ThemeProvider theme={createTheme()}>
        <PureNamespacesAutocomplete
          namespaceNames={namespaces}
          onChange={vi.fn()}
          filter={{ namespaces: new Set(namespaces) }}
        />
      </ThemeProvider>
    );

    expect(
      screen.getByText('observability, checkout-production, payments-production')
    ).toBeInTheDocument();
  });

  it('applies only from Enter, not ordinary selection changes', () => {
    const onApply = vi.fn();
    const onChange = vi.fn();

    render(
      <ThemeProvider theme={createTheme()}>
        <PureNamespacesAutocomplete
          namespaceNames={['default']}
          onChange={onChange}
          onApply={onApply}
          filter={{ namespaces: new Set() }}
        />
      </ThemeProvider>
    );

    const input = screen.getByRole('combobox', { name: 'Namespaces' });
    fireEvent.change(input, { target: { value: 'default' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onApply).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
  });
});
