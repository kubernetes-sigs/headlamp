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

import Button from '@mui/material/Button';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { configureStore } from '@reduxjs/toolkit';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { Provider } from 'react-redux';
import { Router } from 'react-router-dom';
import filterReducer from '../../redux/filterSlice';
import SectionFilterHeader from './SectionFilterHeader';

vi.mock('./NamespacesAutocomplete', () => ({
  NamespacesAutocomplete: ({ onApply }: { onApply?: () => void }) => (
    <input
      aria-controls="namespace-options"
      aria-expanded="false"
      aria-label="Namespaces"
      onKeyDown={event => event.key === 'Enter' && onApply?.()}
      role="combobox"
    />
  ),
}));

vi.mock('./LabelSelectorInput', () => ({
  LabelSelectorInput: ({ onApply }: { onApply?: () => void }) => (
    <input aria-label="Label Selector" onKeyDown={event => event.key === 'Enter' && onApply?.()} />
  ),
}));

describe('SectionFilterHeader', () => {
  const renderHeader = (
    filter = { namespaces: new Set<string>(), labelSelector: '' },
    initialEntry = '/'
  ) => {
    const theme = createTheme({
      palette: {
        headerStyle: { main: {}, subsection: {}, normal: {}, label: {} },
      } as any,
    });
    const store = configureStore({
      reducer: { filter: filterReducer },
      preloadedState: { filter },
      middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
    });
    const history = createMemoryHistory({ initialEntries: [initialEntry] });

    const result = render(
      <Provider store={store}>
        <Router history={history}>
          <ThemeProvider theme={theme}>
            <SectionFilterHeader
              title="Pods"
              titleSideActions={[<Button key="create">Create</Button>]}
            />
          </ThemeProvider>
        </Router>
      </Provider>
    );

    return { ...result, history, store };
  };

  it('initializes the label selector from the URL while editors are hidden', async () => {
    const { store } = renderHeader(
      { namespaces: new Set<string>(), labelSelector: '' },
      '/?labelSelector=environment%20in%20(production)'
    );

    await waitFor(() => {
      expect(store.getState().filter.labelSelector).toBe('environment in (production)');
    });
    expect(screen.getByRole('button', { name: /Edit Label Selector$/ })).toHaveTextContent(
      'environment in (production)'
    );
  });

  it('clears the label selector when browser history removes it', async () => {
    const { history, store } = renderHeader(
      { namespaces: new Set<string>(), labelSelector: '' },
      '/?labelSelector=app%3Dnginx'
    );
    await waitFor(() => expect(store.getState().filter.labelSelector).toBe('app=nginx'));

    act(() => history.push('/'));

    await waitFor(() => expect(store.getState().filter.labelSelector).toBe(''));
  });

  it('does not apply a malformed selector from the URL', async () => {
    const { store } = renderHeader(
      { namespaces: new Set<string>(), labelSelector: 'previous=value' },
      '/?labelSelector=app%20in%20('
    );

    await waitFor(() => expect(store.getState().filter.labelSelector).toBe(''));
  });

  it('shows a filter action after Create when filters are empty', async () => {
    const user = userEvent.setup();
    renderHeader();

    const title = screen.getByRole('heading', { name: 'Pods' });
    const createButton = screen.getByRole('button', { name: 'Create' });
    const filterButton = screen.getByRole('button', { name: /Filter resources$/ });

    expect(createButton.compareDocumentPosition(filterButton)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(screen.queryByLabelText('Resource filters')).not.toBeInTheDocument();

    await user.click(filterButton);

    const filters = screen.getByLabelText('Resource filters');
    const namespaces = screen.getByRole('combobox', { name: 'Namespaces' });
    const labelSelector = screen.getByRole('textbox', { name: 'Label Selector' });

    expect(filters).toContainElement(namespaces);
    expect(filters).toContainElement(labelSelector);
    expect(namespaces.compareDocumentPosition(labelSelector)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(filters).not.toContainElement(createButton);
    expect(title.compareDocumentPosition(filters)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('shows active filters as editable subtitles', async () => {
    const user = userEvent.setup();
    renderHeader({
      namespaces: new Set(['payments-production', 'checkout-production']),
      labelSelector: 'app=checkout',
    });

    const summary = screen.getByLabelText('Resource filter summary');
    expect(summary).toHaveTextContent('payments-production, checkout-production');
    expect(summary).toHaveTextContent('app=checkout');
    expect(summary.querySelectorAll('.MuiTypography-h2')).toHaveLength(2);
    const summaryTypography = summary.querySelector('.MuiTypography-h2')!;
    expect(getComputedStyle(summaryTypography).fontSize).toBe('1.25rem');
    expect(summaryTypography).not.toHaveClass('MuiTypography-noWrap');
    expect(getComputedStyle(summaryTypography).overflowWrap).toBe('anywhere');
    expect(summary).not.toHaveTextContent('Namespaces:');
    expect(summary).not.toHaveTextContent('Label Selector:');
    expect(screen.queryByLabelText('Resource filters')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Filter resources$/ })).toBeInTheDocument();
    expect(screen.queryByTestId('EditOutlinedIcon')).not.toBeInTheDocument();

    const namespacesLink = screen.getByRole('button', { name: /Edit Namespaces$/ });
    await user.hover(namespacesLink);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Namespaces: payments-production, checkout-production');
    expect(tooltip.firstElementChild).not.toBeNull();
    expect(getComputedStyle(tooltip.firstElementChild!).backgroundColor).toBe('rgb(255, 255, 255)');
    expect(getComputedStyle(tooltip.firstElementChild!).opacity).toBe('1');
    await user.unhover(namespacesLink);
    await user.click(namespacesLink);

    expect(screen.getByLabelText('Resource filters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hide filters$/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Hide filters$/ }));
    expect(screen.getByLabelText('Resource filter summary')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Filter resources$/ }));
    await user.type(screen.getByRole('textbox', { name: 'Label Selector' }), '{Enter}');
    expect(screen.getByLabelText('Resource filter summary')).toBeInTheDocument();
  });
});
