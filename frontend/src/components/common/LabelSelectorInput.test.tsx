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

import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import filterReducer, { setLabelSelectorFilter } from '../../redux/filterSlice';
import { LabelSelectorInput } from './LabelSelectorInput';

// Mock getCluster
vi.mock('../../lib/cluster', () => ({
  getCluster: () => 'test-cluster',
}));

describe('LabelSelectorInput', () => {
  let store: any;

  beforeEach(() => {
    localStorage.clear();
    store = configureStore({
      reducer: {
        filter: filterReducer,
      },
    });
  });

  const renderComponent = () => {
    return render(
      <Provider store={store}>
        <MemoryRouter>
          <LabelSelectorInput />
        </MemoryRouter>
      </Provider>
    );
  };

  it('should render the label selector input', () => {
    renderComponent();
    expect(screen.getByLabelText(/Label Selector$/i)).toBeInTheDocument();
  });

  it('should display placeholder text', () => {
    renderComponent();
    expect(screen.getByPlaceholderText(/e.g. app=nginx/i)).toBeInTheDocument();
  });

  it('should show Kubernetes label query examples', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.hover(screen.getByRole('button', { name: /Label Selector.*Examples/i }));

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.firstElementChild).not.toBeNull();
    expect(getComputedStyle(tooltip.firstElementChild!).backgroundColor).toBe('rgb(255, 255, 255)');
    expect(screen.getByText('app=nginx')).toBeInTheDocument();
    expect(screen.getByText('tier!=backend')).toBeInTheDocument();
    expect(screen.getByText('env in (production,staging)')).toBeInTheDocument();
    expect(screen.getByText('env notin (dev)')).toBeInTheDocument();
    expect(screen.getByText('partition')).toBeInTheDocument();
    expect(screen.getByText('!partition')).toBeInTheDocument();
  });

  it('should show query examples when the help button receives keyboard focus', async () => {
    const user = userEvent.setup();
    renderComponent();

    const helpButton = screen.getByLabelText(/Label Selector.*Examples/i);
    screen.getByLabelText(/Label Selector$/i).focus();
    await user.tab();

    expect(helpButton).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toBeVisible();
  });

  it('should show query examples when the help button is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByLabelText(/Label Selector.*Examples/i));

    expect(await screen.findByRole('tooltip')).toBeVisible();
  });

  it('should update input value on change', async () => {
    const user = userEvent.setup();
    renderComponent();

    const input = screen.getByLabelText(/Label Selector$/i) as HTMLInputElement;
    await user.type(input, 'app=nginx');

    expect(input.value).toBe('app=nginx');
  });

  it('should suggest label keys from loaded cluster resources', async () => {
    const user = userEvent.setup();
    render(
      <Provider store={store}>
        <MemoryRouter>
          <LabelSelectorInput labelKeys={['app.kubernetes.io/name', 'environment', 'tier']} />
        </MemoryRouter>
      </Provider>
    );

    const input = screen.getByLabelText(/Label Selector$/i);
    await user.type(input, 'app.k');

    expect(await screen.findByRole('option', { name: 'app.kubernetes.io/name' })).toBeVisible();
    expect(screen.queryByRole('option', { name: 'environment' })).not.toBeInTheDocument();
  });

  it('should complete the active key without replacing earlier requirements', async () => {
    const user = userEvent.setup();
    render(
      <Provider store={store}>
        <MemoryRouter>
          <LabelSelectorInput labelKeys={['app.kubernetes.io/name', 'tier']} />
        </MemoryRouter>
      </Provider>
    );

    const input = screen.getByLabelText(/Label Selector$/i) as HTMLInputElement;
    await user.type(input, 'tier=frontend, app.k');
    await user.click(await screen.findByRole('option', { name: 'app.kubernetes.io/name' }));

    expect(input.value).toBe('tier=frontend, app.kubernetes.io/name');
    expect(store.getState().filter.labelSelector).toBe('');
  });

  it('should complete a highlighted key with Enter before applying the selector', async () => {
    const user = userEvent.setup();
    render(
      <Provider store={store}>
        <MemoryRouter>
          <LabelSelectorInput labelKeys={['app.kubernetes.io/name']} />
        </MemoryRouter>
      </Provider>
    );

    const input = screen.getByLabelText(/Label Selector$/i) as HTMLInputElement;
    await user.type(input, 'app.k');
    await screen.findByRole('option', { name: 'app.kubernetes.io/name' });
    await user.keyboard('{Enter}');

    expect(input.value).toBe('app.kubernetes.io/name');
    expect(store.getState().filter.labelSelector).toBe('');
  });

  it('should not suggest keys while editing an operator or value', async () => {
    const user = userEvent.setup();
    render(
      <Provider store={store}>
        <MemoryRouter>
          <LabelSelectorInput labelKeys={['app.kubernetes.io/name']} />
        </MemoryRouter>
      </Provider>
    );

    await user.type(screen.getByLabelText(/Label Selector$/i), 'app=ng');

    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('should dispatch filter action on Enter key', async () => {
    const user = userEvent.setup();
    renderComponent();

    const input = screen.getByLabelText(/Label Selector$/i);
    await user.type(input, 'app=nginx{Enter}');

    await waitFor(() => {
      expect(store.getState().filter.labelSelector).toBe('app=nginx');
    });
  });

  it('should dispatch filter action on blur', async () => {
    const user = userEvent.setup();
    renderComponent();

    const input = screen.getByLabelText(/Label Selector$/i);
    await user.type(input, 'app=nginx');
    await user.tab();

    await waitFor(() => {
      expect(store.getState().filter.labelSelector).toBe('app=nginx');
    });
  });

  it('should show clear button when input has value', async () => {
    const user = userEvent.setup();
    renderComponent();

    const input = screen.getByLabelText(/Label Selector$/i);
    await user.type(input, 'app=nginx');

    expect(screen.getByLabelText(/Clear/i)).toBeInTheDocument();
  });

  it('should clear input when clear button is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();

    const input = screen.getByLabelText(/Label Selector$/i) as HTMLInputElement;
    await user.type(input, 'app=nginx');

    const clearButton = screen.getByLabelText(/Clear/i);
    // Use mouseDown instead of click since the button uses onMouseDown
    await user.pointer({ keys: '[MouseLeft>]', target: clearButton });

    expect(input.value).toBe('');
    await waitFor(() => {
      expect(store.getState().filter.labelSelector).toBe('');
    });
  });

  it('should persist filter to localStorage', async () => {
    const user = userEvent.setup();
    renderComponent();

    const input = screen.getByLabelText(/Label Selector$/i);
    await user.type(input, 'app=nginx{Enter}');

    await waitFor(() => {
      const stored = localStorage.getItem('headlamp-label-selector_test-cluster');
      expect(stored).toBe('app=nginx');
    });
  });

  it('should initialize from URL query parameter', async () => {
    const storeWithUrlParam = configureStore({
      reducer: {
        filter: filterReducer,
      },
    });

    render(
      <Provider store={storeWithUrlParam}>
        <MemoryRouter initialEntries={['/?labelSelector=app=nginx']}>
          <LabelSelectorInput />
        </MemoryRouter>
      </Provider>
    );

    const input = screen.getByLabelText(/Label Selector$/i) as HTMLInputElement;
    await waitFor(() => {
      expect(input.value).toBe('app=nginx');
    });
  });

  it('should trim whitespace from input value', async () => {
    const user = userEvent.setup();
    renderComponent();

    const input = screen.getByLabelText(/Label Selector$/i);
    await user.type(input, '  app=nginx  {Enter}');

    await waitFor(() => {
      expect(store.getState().filter.labelSelector).toBe('app=nginx');
    });
  });

  it('should handle complex label selector syntax', async () => {
    const user = userEvent.setup();
    renderComponent();

    const input = screen.getByLabelText(/Label Selector$/i);
    const complexSelector = 'app=nginx,env in (prod,staging),tier!=backend';
    await user.type(input, `${complexSelector}{Enter}`);

    await waitFor(() => {
      expect(store.getState().filter.labelSelector).toBe(complexSelector);
    });
  });

  it('should show an error without applying invalid selector syntax', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    render(
      <Provider store={store}>
        <MemoryRouter>
          <LabelSelectorInput onApply={onApply} />
        </MemoryRouter>
      </Provider>
    );

    const input = screen.getByLabelText(/Label Selector$/i);
    await user.type(input, 'app in ({Enter}');

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(await screen.findByText(/Invalid label selector/i)).toBeVisible();
    expect(store.getState().filter.labelSelector).toBe('');
    expect(localStorage.getItem('headlamp-label-selector_test-cluster')).toBeNull();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('should keep a stable width while editing a long selector', async () => {
    const user = userEvent.setup();
    renderComponent();

    const input = screen.getByLabelText(/Label Selector$/i) as HTMLInputElement;
    const field = input.closest('.MuiFormControl-root')!;
    const widthBeforeEditing = getComputedStyle(field).width;
    const longSelector = 'app.kubernetes.io/name=checkout-api,environment=production,tier!=backend';

    await user.type(input, longSelector);

    expect(input.value).toBe(longSelector);
    expect(getComputedStyle(field).width).toBe(widthBeforeEditing);
  });

  it('should sync local input with Redux state when labelSelector changes externally', async () => {
    renderComponent();

    const input = screen.getByLabelText(/Label Selector$/i) as HTMLInputElement;
    expect(input.value).toBe('');

    // Simulate external Redux update (e.g., via resetFilter action)
    store.dispatch(setLabelSelectorFilter('external=value'));

    await waitFor(() => {
      expect(input.value).toBe('external=value');
    });
  });

  it('should clear input when Escape key is pressed', async () => {
    const user = userEvent.setup();
    renderComponent();

    const input = screen.getByLabelText(/Label Selector$/i) as HTMLInputElement;
    await user.type(input, 'app=nginx');
    expect(input.value).toBe('app=nginx');

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(input.value).toBe('');
      expect(store.getState().filter.labelSelector).toBe('');
    });
  });
});
