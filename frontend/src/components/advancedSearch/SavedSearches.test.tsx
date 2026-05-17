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

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TestContext } from '../../test';
import { SAVED_ADVANCED_SEARCHES_KEY } from './savedAdvancedSearches';
import { SavedSearches } from './SavedSearches';

describe('SavedSearches', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('opens the saved searches popover when clicked', () => {
    render(
      <TestContext>
        <SavedSearches rawQuery="" resourcesValue="" onSearchSelected={() => {}} />
      </TestContext>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Saved Searches' }));

    expect(screen.getByText('Save current search')).toBeInTheDocument();
    expect(screen.getByText('No saved searches yet.')).toBeInTheDocument();
  });

  it('clears transient popover state when dismissed', async () => {
    localStorage.setItem(
      SAVED_ADVANCED_SEARCHES_KEY,
      JSON.stringify([
        {
          id: 'saved-1',
          name: 'Existing',
          query: 'true',
          resources: 'all',
          namespaces: [],
          createdAt: 1,
        },
      ])
    );

    render(
      <TestContext>
        <SavedSearches rawQuery="true" resourcesValue="all" onSearchSelected={() => {}} />
      </TestContext>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Saved Searches' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Draft save name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(screen.getByDisplayValue('Existing')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('presentation'), { code: 'Escape', key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByText('Save current search')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Saved Searches' }));

    expect(screen.queryByDisplayValue('Existing')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('');
  });
});
