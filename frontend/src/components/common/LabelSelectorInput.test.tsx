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
    expect(screen.getByLabelText(/Label Selector/i)).toBeInTheDocument();
  });

  it('should display placeholder text', () => {
    renderComponent();
    expect(screen.getByPlaceholderText(/e.g. app=nginx/i)).toBeInTheDocument();
  });

  it('should update input value on change', async () => {
    const user = userEvent.setup();
    renderComponent();

    const input = screen.getByLabelText(/Label Selector/i) as HTMLInputElement;
    await user.type(input, 'app=nginx');

    expect(input.value).toBe('app=nginx');
  });

  it('should dispatch filter action on Enter key', async () => {
    const user = userEvent.setup();
    renderComponent();

    const input = screen.getByLabelText(/Label Selector/i);
    await user.type(input, 'app=nginx{Enter}');

    await waitFor(() => {
      expect(store.getState().filter.labelSelector).toBe('app=nginx');
    });
  });

  it('should dispatch filter action on blur', async () => {
    const user = userEvent.setup();
    renderComponent();

    const input = screen.getByLabelText(/Label Selector/i);
    await user.type(input, 'app=nginx');
    await user.tab();

    await waitFor(() => {
      expect(store.getState().filter.labelSelector).toBe('app=nginx');
    });
  });

  it('should show clear button when input has value', async () => {
    const user = userEvent.setup();
    renderComponent();

    const input = screen.getByLabelText(/Label Selector/i);
    await user.type(input, 'app=nginx');

    expect(screen.getByLabelText(/Clear/i)).toBeInTheDocument();
  });

  it('should clear input when clear button is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();

    const input = screen.getByLabelText(/Label Selector/i) as HTMLInputElement;
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

    const input = screen.getByLabelText(/Label Selector/i);
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

    const input = screen.getByLabelText(/Label Selector/i) as HTMLInputElement;
    await waitFor(() => {
      expect(input.value).toBe('app=nginx');
    });
  });

  it('should trim whitespace from input value', async () => {
    const user = userEvent.setup();
    renderComponent();

    const input = screen.getByLabelText(/Label Selector/i);
    await user.type(input, '  app=nginx  {Enter}');

    await waitFor(() => {
      expect(store.getState().filter.labelSelector).toBe('app=nginx');
    });
  });

  it('should handle complex label selector syntax', async () => {
    const user = userEvent.setup();
    renderComponent();

    const input = screen.getByLabelText(/Label Selector/i);
    const complexSelector = 'app=nginx,env in (prod,staging),tier!=backend';
    await user.type(input, `${complexSelector}{Enter}`);

    await waitFor(() => {
      expect(store.getState().filter.labelSelector).toBe(complexSelector);
    });
  });

  it('should sync local input with Redux state when labelSelector changes externally', async () => {
    renderComponent();

    const input = screen.getByLabelText(/Label Selector/i) as HTMLInputElement;
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

    const input = screen.getByLabelText(/Label Selector/i) as HTMLInputElement;
    await user.type(input, 'app=nginx');
    expect(input.value).toBe('app=nginx');

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(input.value).toBe('');
      expect(store.getState().filter.labelSelector).toBe('');
    });
  });
});
